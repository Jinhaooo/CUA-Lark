import { NutJSOperator } from '@ui-tars/operator-nut-js';
import { mouse } from '@computer-use/nut-js';
import type {
  ScreenshotOutput,
  ExecuteParams,
  ExecuteOutput,
} from '@ui-tars/sdk/core';
import type { Box, OcrClient } from '../types.js';
import type { ActionVerifier, PredictionParsed, ActionVerifyConfig } from './ActionVerifier.js';
import { ActionIntentLowConfidence, SilentActionFailure } from './ActionVerifier.js';

export class LarkOperator {
  static MANUAL = {
    ACTION_SPACES: [
      "click(start_box='[x1, y1, x2, y2]')",
      "left_double(start_box='[x1, y1, x2, y2]')",
      "right_single(start_box='[x1, y1, x2, y2]')",
      "drag(start_box='[x1, y1, x2, y2]', end_box='[x3, y3, x4, y4]')",
      "hotkey(key='')",
      "type(content='') #If you want to submit your input, use \"\\n\" at the end of `content`.",
      "scroll(start_box='[x1, y1, x2, y2]', direction='down or up or right or left')",
      'wait() #Sleep for 5s and take a screenshot to check for any changes.',
      'finished()',
      "call_user() # Submit the task and call the user when the task is unsolvable, or when you need the user's help.",
    ] as string[],
  };

  private nutjs = new NutJSOperator();
  private executingAction = false;
  private ocrClient: OcrClient | null = null;
  private actionVerifier: ActionVerifier | null = null;
  private actionVerifyEnabled = false;

  async screenshot(): Promise<ScreenshotOutput> {
    return this.nutjs.screenshot();
  }

  async execute(params: ExecuteParams): Promise<ExecuteOutput> {
    this.executingAction = true;
    let beforeShot: Buffer | null = null;

    try {
      const parsedPrediction = this.parsePrediction(params);

      if (this.actionVerifier && this.actionVerifyEnabled) {
        beforeShot = await this.captureScreenshot();
        await this.verifyBeforeAction(parsedPrediction, beforeShot);
      }

      const result = await this.nutjs.execute(normalizeExecuteParams(params));

      if (this.actionVerifier && this.actionVerifyEnabled && beforeShot) {
        const afterShot = await this.captureScreenshot();
        await this.verifyAfterAction(parsedPrediction, beforeShot, afterShot);
      }

      return result;
    } finally {
      this.executingAction = false;
    }
  }

  private parsePrediction(params: ExecuteParams): PredictionParsed {
    const actionType = params.parsedPrediction.action_type ?? '';
    const actionInputs = params.parsedPrediction.action_inputs ?? {};
    const thought = params.prediction ?? '';

    return { action_type: actionType, action_inputs: actionInputs, thought };
  }

  private async captureScreenshot(): Promise<Buffer> {
    const screenshot = await this.screenshot();
    return Buffer.from(screenshot.base64, 'base64');
  }

  private async verifyBeforeAction(parsedPrediction: PredictionParsed, beforeShot: Buffer): Promise<void> {
    if (!this.actionVerifier) return;

    if (this.actionVerifier.isExempt(parsedPrediction.action_type)) {
      return;
    }

    const config = this.getActionVerifyConfig();
    const result = await this.actionVerifier.beforeAction(parsedPrediction, beforeShot);

    if (!result.uniquely_visible && result.confidence >= config.intent_threshold) {
      throw new ActionIntentLowConfidence(result.confidence, result.reasoning);
    }
  }

  private async verifyAfterAction(
    parsedPrediction: PredictionParsed,
    beforeShot: Buffer,
    afterShot: Buffer
  ): Promise<void> {
    if (!this.actionVerifier) return;

    if (this.actionVerifier.isExempt(parsedPrediction.action_type)) {
      return;
    }

    const config = this.getActionVerifyConfig();
    const result = await this.actionVerifier.afterAction(parsedPrediction, beforeShot, afterShot);

    if (!result.as_expected && result.confidence >= config.result_threshold) {
      throw new SilentActionFailure(result.confidence, result.reasoning);
    }
  }

  private getActionVerifyConfig(): ActionVerifyConfig {
    return {
      intent_threshold: 0.7,
      result_threshold: 0.6,
      exempt_action_types: ['wait', 'finished', 'call_user', 'user_stop', 'hotkey'],
    };
  }

  isExecuting(): boolean {
    return this.executingAction;
  }

  async getMousePosition(): Promise<{ x: number; y: number }> {
    const position = await mouse.getPosition();
    return { x: position.x, y: position.y };
  }

  setOcrClient(ocrClient: OcrClient | null): void {
    this.ocrClient = ocrClient;
  }

  setActionVerifier(verifier: ActionVerifier | null): void {
    this.actionVerifier = verifier;
  }

  setActionVerifyEnabled(enabled: boolean): void {
    this.actionVerifyEnabled = enabled;
  }

  async findByText(text: string): Promise<Box | null> {
    if (!this.ocrClient) {
      return null;
    }

    try {
      const screenshot = await this.screenshot();
      const imageBuffer = Buffer.from(screenshot.base64, 'base64');
      const result = await this.ocrClient.locate(imageBuffer, text);

      if (!result) {
        return null;
      }

      return {
        x: result.x1,
        y: result.y1,
        width: result.x2 - result.x1,
        height: result.y2 - result.y1,
      };
    } catch {
      return null;
    }
  }

  async findByA11y(role: string, name: string): Promise<Box | null> {
    return null;
  }

  async waitForVisible(text: string, opts?: { timeoutMs?: number }): Promise<void> {
    if (!this.ocrClient) {
      throw new NotImplementedError('waitForVisible requires OCR, available from M3');
    }

    const timeoutMs = opts?.timeoutMs ?? 5000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const box = await this.findByText(text);
      if (box) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error(`waitForVisible timed out after ${timeoutMs}ms for text: ${text}`);
  }
}

function normalizeExecuteParams(params: ExecuteParams): ExecuteParams {
  const actionInputs = params.parsedPrediction.action_inputs ?? {};
  const startBox = normalizeBoxInput(actionInputs.start_box, params) ?? normalizePredictionBox(params.prediction, params);
  const endBox = normalizeBoxInput(actionInputs.end_box, params);
  if (!startBox && !endBox) {
    return params;
  }

  return {
    ...params,
    parsedPrediction: {
      ...params.parsedPrediction,
      action_inputs: {
        ...actionInputs,
        ...(startBox ? { start_box: startBox } : {}),
        ...(endBox ? { end_box: endBox } : {}),
      },
    },
  };
}

function normalizeBoxInput(input: unknown, params: ExecuteParams): string | null {
  if (typeof input !== 'string') {
    return null;
  }

  const coords = parseBoxLike(input);
  if (!coords) {
    return null;
  }

  return formatBox(coords, params);
}

function normalizePredictionBox(prediction: string, params: ExecuteParams): string | null {
  for (const match of prediction.matchAll(/start_box\s*=\s*['"]([^'"]+)['"]/gi)) {
    const box = parseBoxLike(match[1]!);
    if (box) {
      return formatBox(box, params);
    }
  }

  const pointTag = prediction.match(/<point>\s*([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s*<\/point>/i);
  if (pointTag) {
    return formatBox(toPointBox(Number(pointTag[1]), Number(pointTag[2])), params);
  }

  const objectPoint = prediction.match(
    /point\s*:\s*\{\s*x\s*:\s*([+-]?\d+(?:\.\d+)?)\s*,?\s*(?:y\s*:\s*)?([+-]?\d+(?:\.\d+)?)\s*\}/i,
  );
  if (objectPoint) {
    return formatBox(toPointBox(Number(objectPoint[1]), Number(objectPoint[2])), params);
  }

  return null;
}

function parseBoxLike(input: string): [number, number, number, number] | null {
  if (/\b[xy][1-4]\b/i.test(input) || /[a-wz]|null|nan/i.test(input)) {
    return null;
  }

  const numbers = input.match(/[+-]?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (numbers.length !== 2 && numbers.length !== 4) {
    return null;
  }

  if (!numbers.every(Number.isFinite)) {
    return null;
  }

  const [x1, y1, x2 = x1, y2 = y1] = numbers;
  return [x1!, y1!, x2!, y2!];
}

function toPointBox(x: number, y: number): [number, number, number, number] {
  return [x, y, x, y];
}

function formatBox(box: [number, number, number, number], params: ExecuteParams): string {
  const safeBox = applyOptionalSafeBounds(box, params);
  const [x1, y1, x2, y2] = safeBox;
  const normalized = [
    normalizeCoord(x1, params.screenWidth),
    normalizeCoord(y1, params.screenHeight),
    normalizeCoord(x2, params.screenWidth),
    normalizeCoord(y2, params.screenHeight),
  ].map(formatCoord).join(', ');
  return `[${normalized}]`;
}

function formatCoord(value: number): string {
  return Number(value.toFixed(6)).toString();
}

function normalizeCoord(value: number, screenSize: number): number {
  if (value <= 1) {
    return value;
  }

  return value <= 1000 ? value / 1000 : value / screenSize;
}

function applyOptionalSafeBounds(
  box: [number, number, number, number],
  params: ExecuteParams,
): [number, number, number, number] {
  const bounds = parseSafeBounds(process.env.CUA_LARK_SAFE_BOUNDS);
  if (!bounds) {
    return box;
  }

  const toScreenX = (value: number) => normalizeCoord(value, params.screenWidth) * params.screenWidth;
  const toScreenY = (value: number) => normalizeCoord(value, params.screenHeight) * params.screenHeight;
  const fromScreenX = (value: number) => value / params.screenWidth;
  const fromScreenY = (value: number) => value / params.screenHeight;

  return [
    fromScreenX(clamp(toScreenX(box[0]), bounds.left, bounds.right)),
    fromScreenY(clamp(toScreenY(box[1]), bounds.top, bounds.bottom)),
    fromScreenX(clamp(toScreenX(box[2]), bounds.left, bounds.right)),
    fromScreenY(clamp(toScreenY(box[3]), bounds.top, bounds.bottom)),
  ];
}

function parseSafeBounds(value: string | undefined): { left: number; top: number; right: number; bottom: number } | null {
  if (!value) {
    return null;
  }

  const parts = value.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || !parts.every(Number.isFinite)) {
    return null;
  }

  const [left, top, right, bottom] = parts;
  if (left! >= right! || top! >= bottom!) {
    return null;
  }

  return { left: left!, top: top!, right: right!, bottom: bottom! };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotImplementedError';
  }
}
