import { NutJSOperator } from '@ui-tars/operator-nut-js';
import { mouse } from '@computer-use/nut-js';
import type {
  ScreenshotOutput,
  ExecuteParams,
  ExecuteOutput,
} from '@ui-tars/sdk/core';
import type { Box } from '../types.js';

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

  async screenshot(): Promise<ScreenshotOutput> {
    return this.nutjs.screenshot();
  }

  async execute(params: ExecuteParams): Promise<ExecuteOutput> {
    this.executingAction = true;
    try {
      return await this.nutjs.execute(normalizeExecuteParams(params));
    } finally {
      this.executingAction = false;
    }
  }

  isExecuting(): boolean {
    return this.executingAction;
  }

  async getMousePosition(): Promise<{ x: number; y: number }> {
    const position = await mouse.getPosition();
    return { x: position.x, y: position.y };
  }

  async findByText(text: string): Promise<Box | null> {
    return null;
  }

  async findByA11y(role: string, name: string): Promise<Box | null> {
    return null;
  }

  async waitForVisible(text: string, opts?: { timeoutMs?: number }): Promise<void> {
    throw new NotImplementedError('waitForVisible requires OCR, available from M3');
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
  // Temporary desktop-safety guard. Leave unset for full-computer control.
  // Set CUA_LARK_SAFE_BOUNDS="left,top,right,bottom" in screen pixels to clamp pointer targets.
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
