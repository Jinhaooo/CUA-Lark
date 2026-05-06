import { z } from 'zod';
import type { Tool, HarnessContext } from '../types.js';

const POLL_INTERVAL_MS = 200;

async function abortAwareSleep(seconds: number, signal?: AbortSignal): Promise<{ aborted: boolean; waitedMs: number }> {
  const startedAt = Date.now();
  const targetMs = seconds * 1000;
  while (Date.now() - startedAt < targetMs) {
    if (signal?.aborted) {
      return { aborted: true, waitedMs: Date.now() - startedAt };
    }
    const remaining = targetMs - (Date.now() - startedAt);
    await new Promise<void>((resolve) => setTimeout(resolve, Math.min(POLL_INTERVAL_MS, remaining)));
  }
  return { aborted: false, waitedMs: Date.now() - startedAt };
}

export const waitTool: Tool<{ seconds: number }> = {
  name: 'wait',
  description: 'Wait for the specified number of seconds',
  argsSchema: z.object({
    seconds: z.number().min(0).max(30),
  }),
  async execute(ctx: HarnessContext & { pauseSignal?: AbortSignal }, args) {
    try {
      // Custom sleep loop honors pauseSignal so C19 ≤ 200ms holds during waits
      // (NutJS' wait() is a single 5s blocking sleep we cannot interrupt).
      const result = await abortAwareSleep(args.seconds, ctx.pauseSignal);
      return {
        success: true,
        observation: result.aborted
          ? `Wait interrupted after ${result.waitedMs}ms (paused by user)`
          : `Waited ${args.seconds}s`,
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
