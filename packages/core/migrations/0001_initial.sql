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

PRAGMA journal_mode=WAL;