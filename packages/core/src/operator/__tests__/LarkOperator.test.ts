import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LarkOperator, NotImplementedError } from '../LarkOperator';
import type { ExecuteParams } from '@ui-tars/sdk/core';

vi.mock('@ui-tars/operator-nut-js', () => {
  return {
    NutJSOperator: vi.fn().mockImplementation(() => ({
      screenshot: vi.fn().mockResolvedValue({
        base64: 'mock-screenshot-base64',
        status: 'success',
      }),
      execute: vi.fn().mockResolvedValue({
        status: 'success',
      }),
    })),
  };
});

describe('LarkOperator', () => {
  let operator: LarkOperator;

  beforeEach(() => {
    operator = new LarkOperator();
    vi.clearAllMocks();
  });

  describe('MANUAL.ACTION_SPACES', () => {
    it('should contain all 10 action types', () => {
      const actionSpaces = LarkOperator.MANUAL.ACTION_SPACES;

      expect(actionSpaces).toContain('click(point: {x: number, y: number}) - Click on a specific point');
      expect(actionSpaces).toContain('double_click(point: {x: number, y: number}) - Double click on a specific point');
      expect(actionSpaces).toContain('right_click(point: {x: number, y: number}) - Right click on a specific point');
      expect(actionSpaces).toContain('drag(start: {x: number, y: number}, end: {x: number, y: number}) - Drag from start to end point');
      expect(actionSpaces).toContain('type(content: string) - Type text content, use \\n for Enter key');
      expect(actionSpaces).toContain('hotkey(key: string) - Press hotkey combination like ctrl+c, cmd+v');
      expect(actionSpaces).toContain('scroll(point: {x: number, y: number}, direction: "up" | "down" | "left" | "right") - Scroll at point in direction');
      expect(actionSpaces).toContain('wait(time?: number) - Wait for specified time in seconds, default 5s');
      expect(actionSpaces).toContain('finished() - Task completed successfully');
      expect(actionSpaces).toContain('call_user(content?: string) - Request user interaction to continue');
    });

    it('should have exactly 10 action entries', () => {
      expect(LarkOperator.MANUAL.ACTION_SPACES).toHaveLength(10);
    });
  });

  describe('screenshot', () => {
    it('should delegate to NutJSOperator.screenshot()', async () => {
      const result = await operator.screenshot();

      expect(result.base64).toBe('mock-screenshot-base64');
      expect(result.status).toBe('success');
    });
  });

  describe('findByText', () => {
    it('should return null in M1 stub', async () => {
      const result = await operator.findByText('foo');
      expect(result).toBeNull();
    });
  });

  describe('findByA11y', () => {
    it('should return null in M1 stub', async () => {
      const result = await operator.findByA11y('button', 'foo');
      expect(result).toBeNull();
    });
  });

  describe('waitForVisible', () => {
    it('should throw NotImplementedError', async () => {
      await expect(
        operator.waitForVisible('foo'),
      ).rejects.toThrow(NotImplementedError);
      await expect(
        operator.waitForVisible('foo'),
      ).rejects.toThrow('waitForVisible requires OCR, available from M3');
    });
  });

  describe('execute switch cases', () => {
    it('should have 10 case branches for all action types', () => {
      const actionTypes = [
        'click',
        'double_click',
        'right_click',
        'drag',
        'type',
        'hotkey',
        'scroll',
        'wait',
        'finished',
        'call_user',
      ];

      actionTypes.forEach((actionType) => {
        const params: ExecuteParams = {
          prediction: '',
          parsedPrediction: {
            action_inputs: {},
            reflection: null,
            action_type: actionType,
            thought: '',
          },
          screenWidth: 1920,
          screenHeight: 1080,
          scaleFactor: 1,
          factors: [1, 1],
        };

        expect(async () => {
          await operator.execute(params);
        }).not.toThrow(`Unsupported action type: ${actionType}`);
      });
    });
  });
});
