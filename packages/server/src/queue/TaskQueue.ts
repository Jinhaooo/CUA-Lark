import type { EventBus } from '../sse/SseBroker.js';
import type { SqliteTraceStore } from '@cua-lark/core/src/trace/SqliteTraceStore.js';
import { ulid } from 'ulid';

export interface TaskQueue {
  enqueue(task: { instruction: string; params?: Record<string, unknown> }): Promise<{ taskId: string }>;
  cancel(taskId: string): Promise<boolean>;
  getStatus(taskId: string): TaskStatus | null;
  size(): number;
}

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export class QueueFull extends Error {
  constructor() {
    super('Task queue full (max 100)');
  }
}

export class TaskQueueImpl implements TaskQueue {
  private queue: Array<{ taskId: string; instruction: string; params?: Record<string, unknown> }> = [];
  private taskStatus = new Map<string, TaskStatus>();
  private abortControllers = new Map<string, AbortController>();
  private isProcessing = false;

  constructor(
    private maxSize: number,
    private eventBus: EventBus,
    private traceStore: SqliteTraceStore
  ) {}

  async enqueue(task: { instruction: string; params?: Record<string, unknown> }): Promise<{ taskId: string }> {
    if (this.queue.length >= this.maxSize) {
      throw new QueueFull();
    }

    const taskId = ulid();
    this.queue.push({ taskId, ...task });
    this.taskStatus.set(taskId, 'queued');

    await this.traceStore.upsertTask({
      id: taskId,
      instruction: task.instruction,
      params: JSON.stringify(task.params || {}),
      status: 'queued',
      enqueuedAt: Date.now(),
    });

    this.processQueue();

    return { taskId };
  }

  async cancel(taskId: string): Promise<boolean> {
    const status = this.taskStatus.get(taskId);
    if (status !== 'queued' && status !== 'running') {
      return false;
    }

    const controller = this.abortControllers.get(taskId);
    if (controller) {
      controller.abort();
    }

    this.taskStatus.set(taskId, 'cancelled');
    await this.traceStore.updateTaskStatus(taskId, 'cancelled');

    this.eventBus.emit({
      kind: 'task_cancelled',
      taskId,
    });

    return true;
  }

  getStatus(taskId: string): TaskStatus | null {
    return this.taskStatus.get(taskId) || null;
  }

  size(): number {
    return this.queue.length;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) continue;

      this.taskStatus.set(task.taskId, 'running');
      await this.traceStore.updateTaskStatus(task.taskId, 'running', { startedAt: Date.now() });

      this.eventBus.emit({
        kind: 'task_started',
        taskId: task.taskId,
        instruction: task.instruction,
        routedSkill: 'default',
        startedAt: Date.now(),
      });

      const controller = new AbortController();
      this.abortControllers.set(task.taskId, controller);

      try {
        await this.executeTask(task, controller.signal);
      } catch (error) {
        this.taskStatus.set(task.taskId, 'failed');
        await this.traceStore.updateTaskStatus(task.taskId, 'failed', {
          finishedAt: Date.now(),
          finishedReason: error instanceof Error ? error.message : 'unknown_error',
        });

        this.eventBus.emit({
          kind: 'task_finished',
          taskId: task.taskId,
          success: false,
          reason: error instanceof Error ? error.message : 'unknown_error',
          durationMs: 0,
          totalTokens: 0,
        });
      } finally {
        this.abortControllers.delete(task.taskId);
      }
    }

    this.isProcessing = false;
  }

  private async executeTask(task: { taskId: string; instruction: string; params?: Record<string, unknown> }, signal: AbortSignal): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 3000));

    if (signal.aborted) {
      return;
    }

    for (let i = 1; i <= 3; i++) {
      if (signal.aborted) return;

      this.eventBus.emit({
        kind: 'iteration_started',
        taskId: task.taskId,
        iteration: i,
        screenshotPath: `traces/${task.taskId}/screenshot-${i}.png`,
      });

      await new Promise((resolve) => setTimeout(resolve, 500));

      const thoughts = ['我需要分析当前情况。', '让我检查一下界面。', '好的，我明白了。'];
      for (const char of thoughts[i - 1]) {
        if (signal.aborted) return;
        this.eventBus.emit({
          kind: 'thought_chunk',
          taskId: task.taskId,
          iteration: i,
          delta: char,
        });
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      this.eventBus.emit({
        kind: 'thought_complete',
        taskId: task.taskId,
        iteration: i,
        full: thoughts[i - 1],
        tokens: 10,
      });

      this.eventBus.emit({
        kind: 'tool_call',
        taskId: task.taskId,
        iteration: i,
        name: 'click',
        args: { x: 100, y: 200 },
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      this.eventBus.emit({
        kind: 'tool_result',
        taskId: task.taskId,
        iteration: i,
        success: true,
        observation: '点击成功',
        durationMs: 300,
      });

      this.eventBus.emit({
        kind: 'iteration_complete',
        taskId: task.taskId,
        iteration: i,
        durationMs: 1000,
        cost: { tokens: 10 },
      });
    }

    this.taskStatus.set(task.taskId, 'completed');
    await this.traceStore.updateTaskStatus(task.taskId, 'completed', {
      finishedAt: Date.now(),
      finishedReason: 'message_sent',
      totalTokens: 30,
    });

    this.eventBus.emit({
      kind: 'task_finished',
      taskId: task.taskId,
      success: true,
      reason: 'message_sent',
      durationMs: 6000,
      totalTokens: 30,
    });
  }
}

export function createTaskQueue(maxSize: number, eventBus: EventBus, traceStore: SqliteTraceStore): TaskQueue {
  return new TaskQueueImpl(maxSize, eventBus, traceStore);
}