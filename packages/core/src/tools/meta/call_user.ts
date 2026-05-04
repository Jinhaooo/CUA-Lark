import { z } from 'zod';
import type { Tool } from '../types.js';

export class CallUserRequired extends Error {
  constructor(public question: string) {
    super(`call_user: ${question}`);
  }
}

export const callUserTool: Tool<{ question: string }> = {
  name: 'call_user',
  description: 'Ask the user for help when the task is unsolvable or needs clarification.',
  argsSchema: z.object({
    question: z.string(),
  }),
  async execute(_ctx, args) {
    throw new CallUserRequired(args.question);
  },
  category: 'meta',
  costHint: 'free',
};