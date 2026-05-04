import type { TraceEvent, TraceEventKind } from '../types.js';

export type { TraceEvent, TraceEventKind } from '../types.js';

export interface TraceWriter {
  write(event: TraceEvent): Promise<void>;
  beginRun(): string;
  endRun(runId: string): Promise<void>;
  saveScreenshot(runId: string, traceId: string, png: Buffer): Promise<string>;
}

export type ExtendedTraceEventKind = TraceEventKind | 
  'task_started' | 'task_finished' | 'task_cancelled' |
  'iteration_started' | 'iteration_complete' |
  'thought_complete' |
  'sse_subscriber_attached' | 'sse_subscriber_detached';

export interface TraceStore {
  appendStreaming(event: TraceEvent): Promise<void>;
  appendBatch(events: TraceEvent[]): Promise<void>;
  getTrace(taskId: string, since?: string): Promise<TraceEvent[]>;
  listTasks(filter: { status?: string; limit?: number; offset?: number }): Promise<{ tasks: TaskSummary[]; total: number }>;
  getTask(taskId: string): Promise<TaskDetail | null>;
  upsertTask(task: Partial<TaskRow> & { id: string }): Promise<void>;
  updateTaskStatus(taskId: string, status: string, fields?: Partial<TaskRow>): Promise<void>;
  close(): void;
}

export interface TaskRow {
  id: string;
  instruction: string;
  params: string;
  status: string;
  enqueuedAt: number;
  startedAt?: number;
  finishedAt?: number;
  totalTokens?: number;
  finishedReason?: string;
  routedSkill?: string;
}

export interface TaskSummary {
  id: string;
  instruction: string;
  status: string;
  enqueuedAt: number;
  startedAt?: number;
  finishedAt?: number;
  totalTokens?: number;
  finishedReason?: string;
  routedSkill?: string;
}

export interface TaskDetail extends TaskSummary {
  params: Record<string, unknown>;
}