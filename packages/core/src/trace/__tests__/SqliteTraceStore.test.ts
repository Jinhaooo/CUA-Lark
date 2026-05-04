import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SqliteTraceStore } from '../SqliteTraceStore';
import { ulid } from 'ulid';

describe('SqliteTraceStore', () => {
  let store: SqliteTraceStore;

  beforeEach(() => {
    store = new SqliteTraceStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('should append streaming event', async () => {
    const taskId = ulid();
    const event = {
      id: ulid(),
      test_run_id: taskId,
      kind: 'harness_iteration',
      name: 'harness_iteration',
      status: 'running',
      started_at: Date.now(),
      ended_at: Date.now(),
      payload: { iteration: 1, thought: 'test' },
    };

    await store.appendStreaming(event);
    const trace = await store.getTrace(taskId);
    expect(trace.length).toBe(1);
    expect(trace[0].id).toBe(event.id);
    expect(trace[0].payload?.iteration).toBe(1);
  });

  it('should append batch events', async () => {
    const taskId = ulid();
    const events = [
      { id: ulid(), test_run_id: taskId, kind: 'task_started', name: 'task_started', status: 'running' as const, started_at: Date.now() },
      { id: ulid(), test_run_id: taskId, kind: 'harness_iteration', name: 'harness_iteration', status: 'running' as const, started_at: Date.now() },
      { id: ulid(), test_run_id: taskId, kind: 'task_finished', name: 'task_finished', status: 'passed' as const, started_at: Date.now() },
    ];

    await store.appendBatch(events);
    const trace = await store.getTrace(taskId);
    expect(trace.length).toBe(3);
  });

  it('should get trace with since parameter', async () => {
    const taskId = ulid();
    const event1 = { id: 'a' + '0'.repeat(25), test_run_id: taskId, kind: 'task_started', name: 'task_started', status: 'running' as const, started_at: Date.now() };
    const event2 = { id: 'b' + '0'.repeat(25), test_run_id: taskId, kind: 'harness_iteration', name: 'harness_iteration', status: 'running' as const, started_at: Date.now() };
    const event3 = { id: 'c' + '0'.repeat(25), test_run_id: taskId, kind: 'task_finished', name: 'task_finished', status: 'passed' as const, started_at: Date.now() };

    await store.appendBatch([event1, event2, event3]);
    
    const trace = await store.getTrace(taskId, event1.id);
    expect(trace.length).toBe(2);
    expect(trace[0].id).toBe(event2.id);
    expect(trace[1].id).toBe(event3.id);
  });

  it('should list tasks with filter', async () => {
    const task1 = { id: ulid(), instruction: 'task 1', params: JSON.stringify({}), status: 'completed' as const, enqueued_at: Date.now() };
    const task2 = { id: ulid(), instruction: 'task 2', params: JSON.stringify({}), status: 'running' as const, enqueued_at: Date.now() };
    const task3 = { id: ulid(), instruction: 'task 3', params: JSON.stringify({}), status: 'completed' as const, enqueued_at: Date.now() };

    await store.upsertTask(task1);
    await store.upsertTask(task2);
    await store.upsertTask(task3);

    const result = await store.listTasks({ status: 'completed', limit: 2 });
    expect(result.total).toBe(2);
    expect(result.tasks.length).toBe(2);
    expect(result.tasks.every(t => t.status === 'completed')).toBe(true);
  });

  it('should get task detail', async () => {
    const taskId = ulid();
    const params = { chatName: 'test', text: 'hello' };
    await store.upsertTask({
      id: taskId,
      instruction: 'send message',
      params: JSON.stringify(params),
      status: 'completed',
      enqueued_at: Date.now(),
      finished_at: Date.now(),
      total_tokens: 100,
      finished_reason: 'message_sent',
      routed_skill: 'lark_im.send_message',
    });

    const task = await store.getTask(taskId);
    expect(task).not.toBeNull();
    expect(task?.id).toBe(taskId);
    expect(task?.instruction).toBe('send message');
    expect(task?.params).toEqual(params);
    expect(task?.status).toBe('completed');
    expect(task?.totalTokens).toBe(100);
  });

  it('should update task status', async () => {
    const taskId = ulid();
    await store.upsertTask({
      id: taskId,
      instruction: 'test',
      params: JSON.stringify({}),
      status: 'queued',
      enqueued_at: Date.now(),
    });

    await store.updateTaskStatus(taskId, 'running', { started_at: Date.now() });
    
    const task = await store.getTask(taskId);
    expect(task?.status).toBe('running');
    expect(task?.startedAt).toBeDefined();
  });
});