import { createRequire } from 'module';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import type { TraceEvent, TraceEventKind } from '../types.js';

const require = createRequire(import.meta.url);

interface Statement<T = unknown> {
  run(...params: unknown[]): { changes: number };
  all(...params: unknown[]): T[];
  get(...params: unknown[]): T | undefined;
}

interface SqliteDatabase {
  pragma(sql: string): unknown;
  exec(sql: string): void;
  prepare<T = unknown>(sql: string): Statement<T>;
  close(): void;
}

const Database = require('better-sqlite3') as new (path: string) => SqliteDatabase;

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface TaskSummary {
  id: string;
  instruction: string;
  status: TaskStatus;
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

export interface TaskRow {
  id: string;
  instruction: string;
  params: string;
  status: string;
  enqueuedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  totalTokens: number | null;
  finishedReason: string | null;
  routedSkill: string | null;
}

type TaskUpsertInput = Partial<TaskRow> & {
  id: string;
  enqueued_at?: number;
  started_at?: number | null;
  finished_at?: number | null;
  total_tokens?: number | null;
  finished_reason?: string | null;
  routed_skill?: string | null;
};

interface TraceEventRow {
  id: string;
  task_id: string;
  parent_id: string | null;
  kind: string;
  name: string;
  status: string;
  started_at: number;
  ended_at: number | null;
  payload: string | null;
  iteration: number | null;
}

interface TaskDbRow {
  id: string;
  instruction: string;
  params: string;
  status: string;
  enqueued_at: number;
  started_at: number | null;
  finished_at: number | null;
  total_tokens: number | null;
  finished_reason: string | null;
  routed_skill: string | null;
}

export interface TraceStore {
  appendStreaming(event: TraceEvent): Promise<void>;
  appendBatch(events: TraceEvent[]): Promise<void>;
  getTrace(taskId: string, since?: string): Promise<TraceEvent[]>;
  getEventsByKinds(kinds: string[]): Promise<TraceEvent[]>;
  listTasks(filter: { status?: TaskStatus; limit?: number; offset?: number }): Promise<{ tasks: TaskSummary[]; total: number }>;
  getTask(taskId: string): Promise<TaskDetail | null>;
  upsertTask(task: TaskUpsertInput): Promise<void>;
  updateTaskStatus(taskId: string, status: TaskStatus, fields?: Partial<TaskUpsertInput>): Promise<void>;
  close(): void;
}

export class SqliteTraceStore implements TraceStore {
  private db: SqliteDatabase;

  constructor(dbPath: string = './traces/cua-lark.db') {
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode=WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY NOT NULL,
        instruction TEXT NOT NULL,
        params TEXT NOT NULL,
        status TEXT NOT NULL,
        enqueued_at INTEGER NOT NULL,
        started_at INTEGER,
        finished_at INTEGER,
        total_tokens INTEGER,
        finished_reason TEXT,
        routed_skill TEXT
      );
      CREATE INDEX IF NOT EXISTS tasks_status_enqueued_idx ON tasks (status, enqueued_at);
      CREATE TABLE IF NOT EXISTS trace_events (
        id TEXT PRIMARY KEY NOT NULL,
        task_id TEXT NOT NULL,
        parent_id TEXT,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        payload TEXT,
        iteration INTEGER
      );
      CREATE INDEX IF NOT EXISTS trace_events_task_started_idx ON trace_events (task_id, started_at);
      CREATE INDEX IF NOT EXISTS trace_events_kind_idx ON trace_events (kind);
    `);
  }

  async appendStreaming(event: TraceEvent): Promise<void> {
    this.insertTraceEvent(event);
  }

  async appendBatch(events: TraceEvent[]): Promise<void> {
    const transaction = this.db.prepare('BEGIN');
    const commit = this.db.prepare('COMMIT');
    const rollback = this.db.prepare('ROLLBACK');
    transaction.run();
    try {
      for (const event of events) {
        this.insertTraceEvent(event);
      }
      commit.run();
    } catch (error) {
      rollback.run();
      throw error;
    }
  }

  async getTrace(taskId: string, since?: string): Promise<TraceEvent[]> {
    const rows = since
      ? this.db
          .prepare<TraceEventRow>(
            'SELECT * FROM trace_events WHERE task_id = ? AND id > ? ORDER BY started_at ASC, id ASC',
          )
          .all(taskId, since)
      : this.db
          .prepare<TraceEventRow>('SELECT * FROM trace_events WHERE task_id = ? ORDER BY started_at ASC, id ASC')
          .all(taskId);

    return rows.map(this.rowToTraceEvent);
  }

  async getEventsByKinds(kinds: string[]): Promise<TraceEvent[]> {
    if (kinds.length === 0) return [];

    const placeholders = kinds.map(() => '?').join(', ');
    const rows = this.db
      .prepare<TraceEventRow>(`SELECT * FROM trace_events WHERE kind IN (${placeholders}) ORDER BY started_at ASC, id ASC`)
      .all(...kinds);

    return rows.map(this.rowToTraceEvent);
  }

  async listTasks(filter: { status?: TaskStatus; limit?: number; offset?: number }): Promise<{ tasks: TaskSummary[]; total: number }> {
    const params: unknown[] = [];
    const where = filter.status ? 'WHERE status = ?' : '';
    if (filter.status) params.push(filter.status);

    const limit = filter.limit ?? 20;
    const offset = filter.offset ?? 0;
    const rows = this.db
      .prepare<TaskDbRow>(`SELECT * FROM tasks ${where} ORDER BY enqueued_at DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset);

    const totalRow = this.db
      .prepare<{ count: number }>(`SELECT COUNT(id) AS count FROM tasks ${where}`)
      .get(...params);

    return {
      tasks: rows.map(this.rowToTaskSummary),
      total: totalRow?.count ?? 0,
    };
  }

  async getTask(taskId: string): Promise<TaskDetail | null> {
    const row = this.db.prepare<TaskDbRow>('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!row) {
      return null;
    }
    return {
      ...this.rowToTaskSummary(row),
      params: JSON.parse(row.params),
    };
  }

  async upsertTask(task: TaskUpsertInput): Promise<void> {
    const normalized = this.normalizeTask(task);
    this.db
      .prepare(
        `INSERT INTO tasks (
          id, instruction, params, status, enqueued_at, started_at, finished_at,
          total_tokens, finished_reason, routed_skill
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          instruction = excluded.instruction,
          params = excluded.params,
          status = excluded.status,
          enqueued_at = excluded.enqueued_at,
          started_at = excluded.started_at,
          finished_at = excluded.finished_at,
          total_tokens = excluded.total_tokens,
          finished_reason = excluded.finished_reason,
          routed_skill = excluded.routed_skill`,
      )
      .run(
        normalized.id,
        normalized.instruction,
        normalized.params,
        normalized.status,
        normalized.enqueuedAt,
        normalized.startedAt,
        normalized.finishedAt,
        normalized.totalTokens,
        normalized.finishedReason,
        normalized.routedSkill,
      );
  }

  async updateTaskStatus(taskId: string, status: TaskStatus, fields?: Partial<TaskUpsertInput>): Promise<void> {
    const updates = this.normalizePartialTask({ status, ...fields });
    const assignments: string[] = ['status = ?'];
    const params: unknown[] = [status];

    for (const [column, value] of Object.entries(updates)) {
      if (column === 'status') continue;
      assignments.push(`${column} = ?`);
      params.push(value);
    }

    params.push(taskId);
    this.db.prepare(`UPDATE tasks SET ${assignments.join(', ')} WHERE id = ?`).run(...params);
  }

  close(): void {
    this.db.close();
  }

  private insertTraceEvent(event: TraceEvent): void {
    const payload = event.payload ? JSON.stringify(event.payload) : null;
    const iteration = typeof event.payload?.iteration === 'number' ? event.payload.iteration : null;

    this.db
      .prepare(
        `INSERT OR IGNORE INTO trace_events (
          id, task_id, parent_id, kind, name, status, started_at, ended_at, payload, iteration
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        event.test_run_id,
        event.parent_id ?? null,
        event.kind,
        event.name,
        event.status,
        event.started_at,
        event.ended_at ?? null,
        payload,
        iteration,
      );
  }

  private normalizeTask(task: TaskUpsertInput): TaskRow {
    return {
      id: task.id,
      instruction: task.instruction ?? '',
      params: task.params ?? '{}',
      status: task.status ?? 'queued',
      enqueuedAt: task.enqueuedAt ?? task.enqueued_at ?? Date.now(),
      startedAt: task.startedAt ?? task.started_at ?? null,
      finishedAt: task.finishedAt ?? task.finished_at ?? null,
      totalTokens: task.totalTokens ?? task.total_tokens ?? null,
      finishedReason: task.finishedReason ?? task.finished_reason ?? null,
      routedSkill: task.routedSkill ?? task.routed_skill ?? null,
    };
  }

  private normalizePartialTask(task: Partial<TaskUpsertInput>): Record<string, unknown> {
    const normalized: Record<string, unknown> = {};
    if (task.instruction !== undefined) normalized.instruction = task.instruction;
    if (task.params !== undefined) normalized.params = task.params;
    if (task.status !== undefined) normalized.status = task.status;
    if (task.enqueuedAt !== undefined || task.enqueued_at !== undefined) normalized.enqueued_at = task.enqueuedAt ?? task.enqueued_at;
    if (task.startedAt !== undefined || task.started_at !== undefined) normalized.started_at = task.startedAt ?? task.started_at;
    if (task.finishedAt !== undefined || task.finished_at !== undefined) normalized.finished_at = task.finishedAt ?? task.finished_at;
    if (task.totalTokens !== undefined || task.total_tokens !== undefined) normalized.total_tokens = task.totalTokens ?? task.total_tokens;
    if (task.finishedReason !== undefined || task.finished_reason !== undefined) normalized.finished_reason = task.finishedReason ?? task.finished_reason;
    if (task.routedSkill !== undefined || task.routed_skill !== undefined) normalized.routed_skill = task.routedSkill ?? task.routed_skill;
    return normalized;
  }

  private rowToTraceEvent(row: TraceEventRow): TraceEvent {
    return {
      id: row.id,
      test_run_id: row.task_id,
      parent_id: row.parent_id ?? undefined,
      kind: row.kind as TraceEventKind,
      name: row.name,
      status: row.status as 'running' | 'passed' | 'failed',
      started_at: row.started_at,
      ended_at: row.ended_at ?? undefined,
      payload: row.payload ? JSON.parse(row.payload) : undefined,
    };
  }

  private rowToTaskSummary(row: TaskDbRow): TaskSummary {
    return {
      id: row.id,
      instruction: row.instruction,
      status: row.status as TaskStatus,
      enqueuedAt: row.enqueued_at,
      startedAt: row.started_at ?? undefined,
      finishedAt: row.finished_at ?? undefined,
      totalTokens: row.total_tokens ?? undefined,
      finishedReason: row.finished_reason ?? undefined,
      routedSkill: row.routed_skill ?? undefined,
    };
  }
}
