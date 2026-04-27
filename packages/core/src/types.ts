export interface TestCase {
  id: string;
  title: string;
  tags: string[];
  instruction: string;
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

export interface VerifySpec {
  kind: 'vlm' | 'ocr' | 'pixel' | 'a11y' | 'all' | 'any';
  prompt?: string;
  contains?: string | RegExp;
  in?: Box;
  refImage?: string;
  threshold?: number;
  role?: string;
  name?: string;
  of?: VerifySpec[];
}

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

export type SkillRegistry = unknown;
export type TraceWriter = unknown;
export type OcrClient = unknown;
