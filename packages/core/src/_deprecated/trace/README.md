# _deprecated/trace

> **Status:** v1.4 D6 + § 4.17 reverted to canonical SQLite TraceStore.
> Moved here by M4.1.0.4 task.

## Why deprecated

`JsonlTraceWriter` was a long-running deviation from D6 (v1.0 decided "Trace 用 SQLite + Drizzle"). M3.5 inherited the JSONL implementation; M4 (v1.4 service-ization) reinstates the SQLite contract because:

1. dashboard Task List / Benchmark / Tool Stats views require SQL aggregation
2. spec § 4.17 streaming `appendStreaming` is feasible on SQLite WAL but awkward on JSONL append
3. v1.4 SSE / dashboard need `?since=<event_id>` increment query — efficient only with indexed SQL

## What replaced it

`packages/core/src/trace/SqliteTraceStore.ts` — full `TraceStore` interface (appendStreaming + appendBatch + getTrace + listTasks + getTask + upsertTask + updateTaskStatus + getEventsByKinds).

## Migration

`scripts/migrate-jsonl-to-sqlite.ts` ports historical M3.5 JSONL traces into the new SQLite database. Idempotent (event IDs are unique).

## DO NOT

- DO NOT add new callers of `JsonlTraceWriter`. Use `SqliteTraceStore` instead.
- DO NOT rebuild this module from this folder; it is reference-only for old test fixtures.

## Existing references (M4-tolerated)

- `core/src/skill/__tests__/SkillRunner{.test,.fallback.test}.ts` — these test the M3.5-deprecated `SkillRunner` module (not yet moved per M3.5 cleanup); they import `JsonlTraceWriter` from this `_deprecated` path solely as a `TraceWriter` test stub. Both files are scheduled for relocation to `_deprecated/skill/` in a follow-up M3.5 cleanup pass.
