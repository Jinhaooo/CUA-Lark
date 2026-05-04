import { z } from 'zod';
import type { Tool } from '../types.js';

export const scrollTool: Tool<{ x: number; y: number; direction: 'up' | 'down' | 'left' | 'right'; distance?: number }> = {
  name: 'scroll',
  description: 'Scroll at the specified coordinates in the given direction',
  argsSchema: z.object({
    x: z.number(),
    y: z.number(),
    direction: z.enum(['up', 'down', 'left', 'right']),
    distance: z.number().optional(),
  }),
  async execute(ctx, args) {
    try {
      await ctx.operator.execute({
        action_type: 'scroll',
        action_inputs: {
          start_box: `[${args.x}, ${args.y}, ${args.x}, ${args.y}]`,
          direction: args.direction,
        },
      });
      return {
        success: true,
        observation: `Scrolled ${args.direction} at (${args.x},${args.y})${args.distance ? ` by ${args.distance}px` : ''}`,
      };
    } catch (error) {
      return {
        success: false,
        observation: `Scroll failed: ${error}`,
        error: { kind: 'unknown', message: String(error) },
      };
    }
  },
  category: 'act',
  costHint: 'free',
};