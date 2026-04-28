export interface TraceEvent {
  id: string;
  test_run_id: string;
  parent_id?: string;
  kind: 'test' | 'skill' | 'step' | 'action' | 'verify' | 'reflect';
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  started_at: number;
  ended_at?: number;
  payload: Record<string, unknown>;
  cost_tokens?: number;
  cost_ms?: number;
}

export interface TraceWriter {
  beginRun(): string;
  write(event: TraceEvent): Promise<void>;
  endRun(runId: string): Promise<void>;
  saveScreenshot(runId: string, traceId: string, png: Buffer): Promise<string>;
}