import { ZodError } from 'zod';

export interface PlannerContext {
  testCaseId?: string;
  configValues?: Record<string, unknown>;
}

export interface PlannerMenu {
  name: string;
  kind: 'procedural' | 'agent_driven' | 'recorded';
  description: string;
  params: { name: string; type: string; required: boolean }[];
  manualSummary?: string;
}

export interface PlanAttempt {
  prompt: string;
  response: string;
  zodError?: ZodError;
}

export class PlanFormatError extends Error {
  attempts: PlanAttempt[];

  constructor(attempts: PlanAttempt[]) {
    super(`Planner failed after ${attempts.length} attempts`);
    this.attempts = attempts;
    this.name = 'PlanFormatError';
  }
}

export class PlanTooLongError extends PlanFormatError {
  constructor(attempts: PlanAttempt[]) {
    super(attempts);
    this.name = 'PlanTooLongError';
  }
}