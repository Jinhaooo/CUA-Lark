import { z } from 'zod';
import type { Tool, HarnessContext, ToolResult } from '../types.js';
import type { EventBus } from '../../trace/EventBus.js';

export class RiskConfirmationRegistry {
  private static instance: RiskConfirmationRegistry;
  private pending: Map<string, {
    resolve: (result: RiskConfirmationResult) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = new Map();

  static getInstance(): RiskConfirmationRegistry {
    if (!RiskConfirmationRegistry.instance) {
      RiskConfirmationRegistry.instance = new RiskConfirmationRegistry();
    }
    return RiskConfirmationRegistry.instance;
  }

  register(taskId: string, timeoutMs: number = 60000): Promise<RiskConfirmationResult> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(taskId);
        resolve({ confirmed: false, source: 'timeout' as const });
      }, timeoutMs);

      this.pending.set(taskId, { resolve, reject, timer });
    });
  }

  resolve(taskId: string, result: RiskConfirmationResult): void {
    const pending = this.pending.get(taskId);
    if (pending) {
      clearTimeout(pending.timer);
      pending.resolve(result);
      this.pending.delete(taskId);
    }
  }

  reject(taskId: string, error: Error): void {
    const pending = this.pending.get(taskId);
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(taskId);
    }
  }

  hasPending(taskId: string): boolean {
    return this.pending.has(taskId);
  }
}

export interface RiskConfirmationResult {
  confirmed: boolean;
  reason?: string;
  source: 'user' | 'timeout';
}

export interface RiskConfirmationContext {
  action: {
    name: string;
    args?: unknown;
  };
  riskLevel: string;
  reason: string;
}

export class AskUserRequired extends Error {
  public readonly taskId: string;
  public readonly question: string;
  public readonly context: RiskConfirmationContext;

  constructor(taskId: string, question: string, context: RiskConfirmationContext) {
    super(`ASK_USER: ${question}`);
    this.name = 'AskUserRequired';
    this.taskId = taskId;
    this.question = question;
    this.context = context;
  }
}

export const askUserTool: Tool<{
  question: string;
  context: RiskConfirmationContext;
}, RiskConfirmationResult> = {
  name: 'ASK_USER',
  description: 'Request human confirmation for a high-risk or destructive operation. Blocks execution until user approves or denies.',
  argsSchema: z.object({
    question: z.string(),
    context: z.object({
      action: z.object({
        name: z.string(),
        args: z.any(),
      }),
      riskLevel: z.string(),
      reason: z.string(),
    }),
  }),
  async execute(ctx: HarnessContext, args: { question: string; context: RiskConfirmationContext }): Promise<ToolResult<RiskConfirmationResult>> {
    const taskId = ctx.testRunId;
    const registry = RiskConfirmationRegistry.getInstance();

    const eventBus = (ctx as any).eventBus as EventBus | undefined;
    if (eventBus) {
      eventBus.emit({
        kind: 'risk_confirmation_required',
        taskId,
        action: args.context.action,
        riskLevel: args.context.riskLevel,
        reason: args.context.reason,
        question: args.question,
      });
    }

    try {
      const result = await registry.register(taskId);

      if (result.confirmed) {
        return {
          success: true,
          data: result,
          observation: `User confirmed risk operation: ${args.question}`,
        };
      } else {
        return {
          success: false,
          data: result,
          observation: `User denied or timed out: ${args.question}`,
          error: {
            kind: 'risk_denied',
            message: result.source === 'timeout' ? 'Risk confirmation timed out' : 'User denied risk operation',
          },
        };
      }
    } catch (error) {
      return {
        success: false,
        observation: `ASK_USER failed: ${error}`,
        error: { kind: 'unknown', message: String(error) },
      };
    }
  },
  category: 'meta',
  costHint: 'free',
};
