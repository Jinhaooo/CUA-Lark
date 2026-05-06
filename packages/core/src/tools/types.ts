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
  | 'budget_exceeded'
  | 'risk_denied'
  | 'risk_timeout_denied';

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

/**
 * Minimal interface the agent needs to discover and load skill guidance at
 * runtime. SkillRegistry implements this; kept as a structural type to avoid
 * a hard import dependency from tools → skill module.
 */
export interface SkillCatalog {
  /** All registered skills, used to populate the "## 可用技能" prompt section. */
  list(): Array<{ name: string; description: string }>;
  /** Body of a skill's SKILL.md (the content used as system prompt context). */
  getBody(name: string): string | undefined;
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
  /** Catalog of skills the agent can introspect/load via load_skill. */
  skillCatalog?: SkillCatalog;
  /** Bodies the agent has loaded so far this run. Mutated by load_skill;
   *  HarnessLoop diffs this each iteration and appends new entries to the
   *  system prompt. Keyed by skill name. */
  loadedSkillBodies?: Map<string, string>;
}
