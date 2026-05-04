import { z } from 'zod';
import type { Tool, HarnessContext } from '../types.js';

interface WaitUntilArgs {
  conditionToolCall: { name: string; args: unknown };
  timeoutSec: number;
}

export const waitUntilTool: Tool<WaitUntilArgs> = {
  name: 'wait_until',
  description: 'Wait until a condition is met by repeatedly calling a tool. The tool will be called every 500ms until it returns success or timeout is reached.',
  argsSchema: z.object({
    conditionToolCall: z.object({
      name: z.string(),
      args: z.record(z.unknown()),
    }),
    timeoutSec: z.number(),
  }),
  async execute(ctx, args) {
    const startTime = Date.now();
    const timeoutMs = args.timeoutSec * 1000;
    const intervalMs = 500;

    while (Date.now() - startTime < timeoutMs) {
      const result = await executeTool(ctx, args.conditionToolCall.name, args.conditionToolCall.args);
      
      if (result.success) {
        const elapsed = (Date.now() - startTime) / 1000;
        return {
          success: true,
          observation: `Condition met after ${elapsed.toFixed(1)}s`,
        };
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    return {
      success: false,
      observation: `Condition timeout after ${args.timeoutSec}s`,
      error: { kind: 'precondition_unmet', message: 'Wait until timeout' },
    };
  },
  category: 'act',
  costHint: 'cheap',
};

async function executeTool(ctx: HarnessContext, toolName: string, args: unknown) {
  const tool = (ctx as any).toolRegistry?.get?.(toolName);
  if (!tool) {
    return { success: false, observation: `Tool ${toolName} not found` };
  }
  return tool.execute(ctx, args);
}