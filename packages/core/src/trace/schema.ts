import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  instruction: text('instruction').notNull(),
  params: text('params').notNull(),
  status: text('status').notNull(),
  enqueuedAt: integer('enqueued_at').notNull(),
  startedAt: integer('started_at'),
  finishedAt: integer('finished_at'),
  totalTokens: integer('total_tokens'),
  finishedReason: text('finished_reason'),
  routedSkill: text('routed_skill'),
}, (table) => ({
  statusEnqueuedIdx: index('tasks_status_enqueued_idx').on(table.status, table.enqueuedAt),
}));

export const traceEvents = sqliteTable('trace_events', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  parentId: text('parent_id'),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull(),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  payload: text('payload'),
  iteration: integer('iteration'),
}, (table) => ({
  taskStartedIdx: index('trace_events_task_started_idx').on(table.taskId, table.startedAt),
  kindIdx: index('trace_events_kind_idx').on(table.kind),
}));

export type TaskRow = typeof tasks.$inferSelect;
export type TraceEventRow = typeof traceEvents.$inferSelect;