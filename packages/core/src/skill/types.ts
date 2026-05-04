import { z } from 'zod';
import type { Context, VerifyResult, VerifyStage } from '../types.js';

export type SkillKind = 'procedural' | 'agent_driven' | 'recorded';

export type PreconditionFn = (ctx: Context) => Promise<boolean>;

export interface VerifyDifficulty {
  uia: 'low' | 'medium' | 'high';
  ocr: 'low' | 'medium' | 'high';
  vlm: 'low' | 'medium' | 'high';
}

export interface VerifyStrategy {
  preferredStages: VerifyStage[];
}

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
  verifyActions?: boolean;
  verifyDifficulty?: VerifyDifficulty;
  verifyStrategy?: VerifyStrategy;
  sideEffects?: SideEffectSpec;
}

export interface ImSideEffects {
  sentMessages?: {
    chatPattern: string;
    contentPattern: string;
    withinMs?: number;
  };
  createdGroups?: {
    namePattern: string;
  };
}

export interface CalendarSideEffects {
  createdEvents?: {
    titlePattern: string;
    timeRangeRef?: string;
  };
}

export interface DocsSideEffects {
  createdDocs?: {
    titlePattern: string;
    folderRef?: string;
  };
  createdFolders?: {
    namePattern: string;
  };
}

export interface SideEffectSpec {
  im?: ImSideEffects;
  calendar?: CalendarSideEffects;
  docs?: DocsSideEffects;
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
  verifyActions?: boolean;
  verifyDifficulty?: VerifyDifficulty;
  verifyStrategy?: VerifyStrategy;
  sideEffects?: SideEffectSpec;
}
