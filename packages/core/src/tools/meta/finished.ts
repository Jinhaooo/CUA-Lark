import { z } from 'zod';
import type { Tool } from '../types.js';

export const finishedTool: Tool<{ success: boolean; reason: string }> = {
  name: 'finished',
  description: 'Declare task completion. This tool signals the HarnessLoop to exit.',
  argsSchema: z.object({
    success: z.boolean(),
    reason: z.string(),
  }),
  async execute(_ctx, args) {
    return {
      success: true,
      observation: `Task finished: ${args.success ? 'success' : 'failed'} - ${args.reason}`,
    };
  },
  category: 'meta',
  costHint: 'free',
};