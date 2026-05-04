import { z } from 'zod';
import type { Tool } from '../types.js';

export const typeTool: Tool<{ text: string }> = {
  name: 'type',
  description: 'Type text using the keyboard. Supports special characters and newlines.',
  argsSchema: z.object({
    text: z.string(),
  }),
  async execute(ctx, args) {
    try {
      await ctx.operator.execute({
        action_type: 'type',
        action_inputs: {
          content: args.text,
        },
      });
      return {
        success: true,
        observation: `Typed '${args.text}'`,
      };
    } catch (error) {
      return {
        success: false,
        observation: `Type failed: ${error}`,
        error: { kind: 'unknown', message: String(error) },
      };
    }
  },
  category: 'act',
  costHint: 'free',
};