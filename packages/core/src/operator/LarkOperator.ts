import { NutJSOperator } from '@ui-tars/operator-nut-js';
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

  async screenshot(): Promise<ScreenshotOutput> {
    return this.nutjs.screenshot();
  }

  async execute(params: ExecuteParams): Promise<ExecuteOutput> {
    return this.nutjs.execute(normalizeExecuteParams(params));
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
  if ('start_box' in actionInputs) {
    return params;
  }

  const point = parsePointFallback(params.prediction);
  if (!point) {
    return params;
  }

  const x = point.x > 1 ? point.x / params.screenWidth : point.x;
  const y = point.y > 1 ? point.y / params.screenHeight : point.y;
  const startBox = `[${formatCoord(x)}, ${formatCoord(y)}, ${formatCoord(x)}, ${formatCoord(y)}]`;

  return {
    ...params,
    parsedPrediction: {
      ...params.parsedPrediction,
      action_inputs: {
        ...actionInputs,
        start_box: startBox,
      },
    },
  };
}

function parsePointFallback(prediction: string): { x: number; y: number } | null {
  const match = prediction.match(
    /point\s*:\s*\{\s*x\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*,?\s*(?:y\s*:\s*)?([0-9]+(?:\.[0-9]+)?)\s*\}/i,
  );
  if (!match) {
    return null;
  }

  const x = Number(match[1]);
  const y = Number(match[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return { x, y };
}

function formatCoord(value: number): string {
  return Number(value.toFixed(6)).toString();
}

export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotImplementedError';
  }
}
