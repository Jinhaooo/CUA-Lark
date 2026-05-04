import { z } from 'zod';
import type { Tool } from '../types.js';

export const clickTool: Tool<{ x: number; y: number }> = {
  name: 'click',
  description: 'Perform a left mouse click at the specified coordinates',
  argsSchema: z.object({
    x: z.number(),
    y: z.number(),
  }),
  async execute(ctx, args) {
    try {
      await ctx.operator.execute({
        action_type: 'click',
        action_inputs: {
          start_box: `[${args.x}, ${args.y}, ${args.x}, ${args.y}]`,
        },
      });
      return {
        success: true,
        observation: `Clicked at (${args.x},${args.y})`,
      };
    } catch (error) {
      return {
        success: false,
        observation: `Click failed: ${error}`,
        error: { kind: 'unknown', message: String(error) },
      };
    }
  },
  category: 'act',
  costHint: 'free',
};