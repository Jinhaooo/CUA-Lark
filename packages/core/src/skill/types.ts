import { z } from 'zod';
import type { Context, VerifyResult } from '../types.js';

export type SkillKind = 'procedural' | 'agent_driven' | 'recorded';

export type PreconditionFn = (ctx: Context) => Promise<boolean>;

export interface Skill<P = unknown, R = unknown> {
  name: string;
  kind: SkillKind;
  description: string;
  manual: string;
  fallback?: string;
  params: z.ZodSchema<P>;
  preconditions?: PreconditionFn[];
  execute: (ctx: Context, params: P) => Promise<R>;
  verify?: (ctx: Context, params: P, result: R) => Promise<VerifyResult>;
  uses?: string[];
  verify_actions?: boolean;
}

export interface SkillDef<P = unknown, R = unknown> {
  name: string;
  kind: SkillKind;
  description: string;
  manual: string;
  fallback?: string;
  params: z.ZodSchema<P>;
  preconditions?: PreconditionFn[];
  execute: (ctx: Context, params: P) => Promise<R>;
  verify?: (ctx: Context, params: P, result: R) => Promise<VerifyResult>;
  uses?: string[];
  verify_actions?: boolean;
}
