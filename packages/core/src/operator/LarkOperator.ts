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
      'click(point: {x: number, y: number}) - Click on a specific point',
      'double_click(point: {x: number, y: number}) - Double click on a specific point',
      'right_click(point: {x: number, y: number}) - Right click on a specific point',
      'drag(start: {x: number, y: number}, end: {x: number, y: number}) - Drag from start to end point',
      'type(content: string) - Type text content, use \\n for Enter key',
      'hotkey(key: string) - Press hotkey combination like ctrl+c, cmd+v',
      'scroll(point: {x: number, y: number}, direction: "up" | "down" | "left" | "right") - Scroll at point in direction',
      'wait(time?: number) - Wait for specified time in seconds, default 5s',
      'finished() - Task completed successfully',
      'call_user(content?: string) - Request user interaction to continue',
    ] as string[],
  };

  private nutjs = new NutJSOperator();

  async screenshot(): Promise<ScreenshotOutput> {
    return this.nutjs.screenshot();
  }

  async execute(params: ExecuteParams): Promise<ExecuteOutput> {
    return this.nutjs.execute(params);
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

export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotImplementedError';
  }
}
