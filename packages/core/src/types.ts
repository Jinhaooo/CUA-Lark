import type { Skill } from './skill/types.js';
import type { TraceEvent } from './trace/types.js';

export interface TestCase {
  id: string;
  title: string;
  tags: string[];
  instruction?: string;
  skillCalls?: SkillCall[];
  expectations: string[];
  timeoutSeconds: number;
}

export interface SkillCall {
  skill: string;
  params: Record<string, unknown>;
  retryPolicy?: { times: number; backoffMs: number };
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type VerifySpec =
  | { kind: 'vlm'; prompt: string }
  | { kind: 'ocr'; contains: string | RegExp; in?: Box }
  | { kind: 'pixel'; refImage: string; threshold: number }
  | { kind: 'a11y'; role: string; name: string }
  | { kind: 'all'; of: VerifySpec[] }
  | { kind: 'any'; of: VerifySpec[] };

export interface VerifyResult {
  passed: boolean;
  reason: string;
  evidence?: { screenshot?: string; ocrText?: string };
}

export type ErrorKind =
  | 'locator_failed'
  | 'verify_failed'
  | 'model_timeout'
  | 'popup_blocked'
  | 'precondition_unmet'
  | 'network'
  | 'unknown';

export class SkillError extends Error {
  kind: ErrorKind;
  evidence?: { screenshot?: string; ocrText?: string };

  constructor(kind: ErrorKind, message: string, evidence?: { screenshot?: string; ocrText?: string }) {
    super(message);
    this.name = 'SkillError';
    this.kind = kind;
    this.evidence = evidence;
  }
}

export interface Config {
  maxLoopCount?: number;
  loopIntervalInMs?: number;
  [key: string]: unknown;
}

export interface Snapshot {
  screenshotBase64?: string;
  ocrText?: string;
}

export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

export interface SkillRegistry {
  register(skill: Skill<unknown, unknown>): void;
  get(name: string): Skill<unknown, unknown> | undefined;
  list(): Skill<unknown, unknown>[];
  loadFromFs(rootDir: string): Promise<void>;
}

export interface TraceWriter {
  beginRun(): string;
  write(event: TraceEvent): Promise<void>;
  endRun(runId: string): Promise<void>;
  saveScreenshot(runId: string, traceId: string, png: Buffer): Promise<string>;
}

export type OcrClient = unknown;

export interface Context {
  operator: any;
  agent: any;
  registry: SkillRegistry;
  model: any;
  trace: TraceWriter;
  ocr: OcrClient;
  logger: Logger;
  config: Config;
  snapshot(): Promise<Snapshot>;
  runSkill(name: string, params: Record<string, unknown>): Promise<any>;
  __fallbackDepth?: number;
}

export interface SkillRunResult {
  passed: boolean;
  skillName: string;
  fallbackUsed?: string;
  error?: SkillError;
  traceId: string;
}

export interface SuiteResult {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  cases: { id: string; passed: boolean; error?: string; durationMs: number }[];
}
