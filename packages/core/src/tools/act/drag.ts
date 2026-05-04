import { z } from 'zod';
import type { Tool } from '../types.js';

export const dragTool: Tool<{ start: { x: number; y: number }; end: { x: number; y: number } }> = {
  name: 'drag',
  description: 'Drag from start coordinates to end coordinates',
  argsSchema: z.object({
    start: z.object({
      x: z.number(),
      y: z.number(),
    }),
    end: z.object({
      x: z.number(),
      y: z.number(),
    }),
  }),
  async execute(ctx, args) {
    try {
      await ctx.operator.execute({
        action_type: 'drag',
        action_inputs: {
          start_box: `[${args.start.x}, ${args.start.y}, ${args.start.x}, ${args.start.y}]`,
          end_box: `[${args.end.x}, ${args.end.y}, ${args.end.x}, ${args.end.y}]`,
        },
      });
      return {
        success: true,
        observation: `Dragged from (${args.start.x},${args.start.y}) to (${args.end.x},${args.end.y})`,
      };
    } catch (error) {
      return {
        success: false,
        observation: `Drag failed: ${error}`,
        error: { kind: 'unknown', message: String(error) },
      };
    }
  },
  category: 'act',
  costHint: 'free',
};