export interface HarnessLoop {
  run(template: SkillTemplate, ctx: HarnessContext): Promise<HarnessResult>;
}

export interface SkillTemplate {
  name: string;
  description: string;
  toolWhitelist?: string[];
  systemPrompt: string;
  finishCriteria: string;
  maxLoopIterations: number;
  sideEffects?: SideEffectsSchema;
  fewShots?: HarnessTrace[][];
}

export interface SideEffectsSchema {
  im?: {
    sentMessages?: {
      chatPattern: string;
      contentPattern: string;
    }[];
  };
  calendar?: {
    createdEvents?: {
      titlePattern: string;
    }[];
  };
  docs?: {
    createdDocs?: {
      titlePattern: string;
    }[];
  };
}

export interface HarnessResult {
  success: boolean;
  finishedReason: string;
  iterations: number;
  trace: HarnessTrace[];
  totalTokens: number;
}

export interface HarnessTrace {
  iteration: number;
  thought: string;
  toolCall: { name: string; args: unknown };
  observation: string;
  durationMs: number;
  cost: { tokens: number };
}

export interface HarnessContext {
  operator: any;
  model: any;
  ocr?: any;
  uia?: any;
  trace: any;
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
  pauseController?: PauseController;
}

export type PauseReason = 'user_hotkey' | 'user_button' | 'user_dashboard';

export interface PauseController {
  readonly state: 'running' | 'paused';
  readonly pausedAtIteration?: number;

  pause(reason: PauseReason): { paused: boolean; alreadyPaused: boolean; pausedAtIteration: number };
  resume(): { resumed: boolean; alreadyRunning: boolean; resumedAtIteration: number };
  skipNextTool(): { skipped: boolean };

  pauseSignal(): AbortSignal;
  waitForResume(): Promise<void>;
}

export interface HarnessConfig {
  maxLoopIterations: number;
  maxTokensPerSkill: number;
  vlmModel?: string;
  messageHistoryLimit: number;
  loopDetectionThreshold: number;
  modelRequestTimeoutMs?: number;
  /** Per-call cap on VLM output tokens. When unset, defaults to 4096 — enough
   *  for the 4-section XML thought + JSON wrapper + reasoning preamble. */
  maxResponseTokens?: number;
}

export class CallUserRequired extends Error {
  constructor(public question: string) {
    super(`call_user: ${question}`);
  }
}
