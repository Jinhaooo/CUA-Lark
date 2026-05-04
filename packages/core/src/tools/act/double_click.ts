import { z } from 'zod';
import type { Tool } from '../types.js';

export const doubleClickTool: Tool<{ x: number; y: number }> = {
  name: 'double_click',
  description: 'Perform a double left mouse click at the specified coordinates',
  argsSchema: z.object({
    x: z.number(),
    y: z.number(),
  }),
  async execute(ctx, args) {
    try {
      await ctx.operator.execute({
        action_type: 'left_double',
        action_inputs: {
          start_box: `[${args.x}, ${args.y}, ${args.x}, ${args.y}]`,
        },
      });
      return {
        success: true,
        observation: `Double-clicked at (${args.x},${args.y})`,
      };
    } catch (error) {
      return {
        success: false,
        observation: `Double click failed: ${error}`,
        error: { kind: 'unknown', message: String(error) },
      };
    }
  },
  category: 'act',
  costHint: 'free',
};