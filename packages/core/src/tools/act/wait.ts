import { z } from 'zod';
import type { Tool } from '../types.js';

export const waitTool: Tool<{ seconds: number }> = {
  name: 'wait',
  description: 'Wait for the specified number of seconds',
  argsSchema: z.object({
    seconds: z.number().min(0).max(30),
  }),
  async execute(ctx, args) {
    try {
      await ctx.operator.execute({
        action_type: 'wait',
      });
      return {
        success: true,
        observation: `Waited ${args.seconds}s`,
      };
    } catch (error) {
      return {
        success: false,
        observation: `Wait failed: ${error}`,
        error: { kind: 'unknown', message: String(error) },
      };
    }
  },
  category: 'act',
  costHint: 'free',
};