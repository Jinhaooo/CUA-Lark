import { z } from 'zod';
import type { Tool } from '../types.js';

export const rightClickTool: Tool<{ x: number; y: number }> = {
  name: 'right_click',
  description: 'Perform a right mouse click at the specified coordinates',
  argsSchema: z.object({
    x: z.number(),
    y: z.number(),
  }),
  async execute(ctx, args) {
    try {
      await ctx.operator.execute({
        action_type: 'right_single',
        action_inputs: {
          start_box: `[${args.x}, ${args.y}, ${args.x}, ${args.y}]`,
        },
      });
      return {
        success: true,
        observation: `Right-clicked at (${args.x},${args.y})`,
      };
    } catch (error) {
      return {
        success: false,
        observation: `Right click failed: ${error}`,
        error: { kind: 'unknown', message: String(error) },
      };
    }
  },
  category: 'act',
  costHint: 'free',
};