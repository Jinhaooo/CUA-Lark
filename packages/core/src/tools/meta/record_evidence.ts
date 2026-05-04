import { z } from 'zod';
import type { Tool } from '../types.js';
import { ulid } from 'ulid';

export const recordEvidenceTool: Tool<{ label: string; content: string }> = {
  name: 'record_evidence',
  description: 'Record key evidence for trace review and debugging.',
  argsSchema: z.object({
    label: z.string(),
    content: z.string(),
  }),
  async execute(ctx, args) {
    try {
      await ctx.trace.write({
        id: ulid(),
        test_run_id: ctx.testRunId,
        parent_id: ctx.parentTraceId,
        kind: 'record_evidence',
        name: args.label,
        status: 'passed',
        started_at: Date.now(),
        ended_at: Date.now(),
        payload: {
          content: args.content,
        },
      });

      return {
        success: true,
        observation: `Evidence recorded: ${args.label}`,
      };
    } catch (error) {
      return {
        success: false,
        observation: `Failed to record evidence: ${error}`,
        error: { kind: 'unknown', message: String(error) },
      };
    }
  },
  category: 'meta',
  costHint: 'free',
};