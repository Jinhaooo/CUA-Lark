import { z } from 'zod';
import type { Tool } from '../types.js';

export const screenshotTool: Tool<{}, { base64: string }> = {
  name: 'screenshot',
  description: 'Capture the current screen and return a screenshot. This is useful for observing the current UI state.',
  argsSchema: z.object({}),
  async execute(ctx) {
    const screenshot = await ctx.operator.screenshot();
    return {
      success: true,
      data: {
        base64: screenshot.base64,
      },
      observation: `Screenshot taken at ${new Date().toISOString()}`,
    };
  },
  category: 'perceive',
  costHint: 'free',
};