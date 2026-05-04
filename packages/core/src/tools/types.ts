import type { ZodSchema } from 'zod';
import type { LarkOperator } from '../operator/LarkOperator.js';
import type { ModelClient } from '../model/types.js';
import type { OcrClient, TraceWriter } from '../types.js';
import type { UiaClient } from '@cua-lark/uia-bridge';

export interface Tool<Args = unknown, Result = unknown> {
  name: string;
  description: string;
  argsSchema: ZodSchema<Args>;
  execute: (ctx: HarnessContext, args: Args) => Promise<ToolResult<Result>>;
  category: 'perceive' | 'act' | 'verify' | 'meta';
  costHint: 'free' | 'cheap' | 'expensive';
}

export interface ToolResult<R = unknown> {
  success: boolean;
  data?: R;
  observation: string;
  error?: { kind: ErrorKind; message: string };
}

export type ErrorKind =
  | 'unknown'
  | 'precondition_unmet'
  | 'verify_failed'
  | 'not_found'
  | 'locator_failed'
  | 'a11y_not_enabled'
  | 'uia_unavailable'
  | 'unknown_tool'
  | 'invalid_tool_args'
  | 'max_iterations_reached'
  | 'vlm_loop_detected'
  | 'tool_call_parse_failed'
  | 'budget_exceeded';

export interface ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  list(filter?: { category?: string; whitelist?: string[] }): Tool[];
  toSystemPromptSection(whitelist?: string[]): string;
}

export interface HarnessConfig {
  maxLoopIterations: number;
  maxTokensPerSkill: number;
  vlmModel?: string;
  messageHistoryLimit: number;
  loopDetectionThreshold: number;
  modelRequestTimeoutMs?: number;
  toolDefaultTimeoutMs?: Record<string, number>;
}

export interface HarnessContext {
  operator: LarkOperator;
  model: ModelClient;
  ocr?: OcrClient;
  uia?: UiaClient;
  trace: TraceWriter;
  testRunId: string;
  parentTraceId: string;
  iteration: number;
  params: Record<string, unknown>;
  config: HarnessConfig;
  logger: {
    info: (...a: unknown[]) => void;
    warn: (...a: unknown[]) => void;
    error: (...a: unknown[]) => void;
  };
}
