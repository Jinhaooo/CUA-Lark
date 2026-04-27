import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LarkOperator, NotImplementedError } from '../LarkOperator';
import type { ExecuteParams } from '@ui-tars/sdk/core';

const mockExecute = vi.hoisted(() => vi.fn());

vi.mock('@ui-tars/operator-nut-js', () => {
  return {
    NutJSOperator: vi.fn().mockImplementation(() => ({
      screenshot: vi.fn().mockResolvedValue({
        base64: 'mock-screenshot-base64',
        status: 'success',
      }),
      execute: mockExecute.mockResolvedValue({
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

      expect(actionSpaces).toContain("click(start_box='[x1, y1, x2, y2]')");
      expect(actionSpaces).toContain("left_double(start_box='[x1, y1, x2, y2]')");
      expect(actionSpaces).toContain("right_single(start_box='[x1, y1, x2, y2]')");
      expect(actionSpaces).toContain("drag(start_box='[x1, y1, x2, y2]', end_box='[x3, y3, x4, y4]')");
      expect(actionSpaces).toContain("type(content='') #If you want to submit your input, use \"\\n\" at the end of `content`.");
      expect(actionSpaces).toContain("hotkey(key='')");
      expect(actionSpaces).toContain("scroll(start_box='[x1, y1, x2, y2]', direction='down or up or right or left')");
      expect(actionSpaces).toContain('wait() #Sleep for 5s and take a screenshot to check for any changes.');
      expect(actionSpaces).toContain('finished()');
      expect(actionSpaces).toContain("call_user() # Submit the task and call the user when the task is unsolvable, or when you need the user's help.");
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

    it('should recover malformed point click predictions as start_box', async () => {
      const params: ExecuteParams = {
        prediction: 'Thought: test\nAction: click(point: {x: 270 200})',
        parsedPrediction: {
          action_inputs: {},
          reflection: null,
          action_type: 'click',
          thought: '',
        },
        screenWidth: 1440,
        screenHeight: 900,
        scaleFactor: 2,
        factors: [1, 1],
      };

      await operator.execute(params);

      expect(mockExecute).toHaveBeenLastCalledWith(
        expect.objectContaining({
          parsedPrediction: expect.objectContaining({
            action_inputs: {
              start_box: '[0.1875, 0.222222, 0.1875, 0.222222]',
            },
          }),
        }),
      );
    });
  });
});
