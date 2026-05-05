/**
 * TaskQueue · 接 SkillRouter + HarnessLoop 真实运行（替换 M4 mock）
 */
import type { EventBus } from '../sse/SseBroker.js';
import type { SqliteTraceStore } from '@cua-lark/core/src/trace/SqliteTraceStore.js';
import type { SkillRegistry } from '@cua-lark/core/src/skill/SkillRegistry.js';
import type {
  SkillRouterImpl,
  HarnessLoop,
  LarkOperator,
  ModelClient,
} from '@cua-lark/core';
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

export interface TaskQueueDeps {
  skillRouter: SkillRouterImpl;
  skillRegistry: SkillRegistry;
  harnessLoop: HarnessLoop;
  operator: LarkOperator;
  modelClient: ModelClient | null;
}

export class TaskQueueImpl implements TaskQueue {
  private queue: Array<{ taskId: string; instruction: string; params?: Record<string, unknown> }> = [];
  private taskStatus = new Map<string, TaskStatus>();
  private abortControllers = new Map<string, AbortController>();
  private isProcessing = false;

  constructor(
    private maxSize: number,
    private eventBus: EventBus,
    private traceStore: SqliteTraceStore,
    private deps?: TaskQueueDeps,
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

      const startedAt = Date.now();
      const controller = new AbortController();
      this.abortControllers.set(task.taskId, controller);

      try {
        const result = await this.executeTask(task, controller.signal);

        this.taskStatus.set(task.taskId, result.success ? 'completed' : 'failed');
        await this.traceStore.updateTaskStatus(task.taskId, result.success ? 'completed' : 'failed', {
          finishedAt: Date.now(),
          finishedReason: result.reason,
          totalTokens: result.totalTokens,
          routedSkill: result.routedSkill,
        });

        this.eventBus.emit({
          kind: 'task_finished',
          taskId: task.taskId,
          success: result.success,
          reason: result.reason,
          durationMs: Date.now() - startedAt,
          totalTokens: result.totalTokens,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'unknown_error';
        this.taskStatus.set(task.taskId, 'failed');
        await this.traceStore.updateTaskStatus(task.taskId, 'failed', {
          finishedAt: Date.now(),
          finishedReason: msg,
        });

        this.eventBus.emit({
          kind: 'task_failed',
          taskId: task.taskId,
          error: { kind: 'unknown', message: msg },
        });

        this.eventBus.emit({
          kind: 'task_finished',
          taskId: task.taskId,
          success: false,
          reason: msg,
          durationMs: Date.now() - startedAt,
          totalTokens: 0,
        });
      } finally {
        this.abortControllers.delete(task.taskId);
      }
    }

    this.isProcessing = false;
  }

  /**
   * 真实执行：SkillRouter 选 template → HarnessLoop 跑 ReAct → 返回结果
   * 没有 deps（modelClient/harnessLoop 等）时降级为 mock，不至于 server 启动崩。
   */
  private async executeTask(
    task: { taskId: string; instruction: string; params?: Record<string, unknown> },
    signal: AbortSignal,
  ): Promise<{ success: boolean; reason: string; totalTokens: number; routedSkill: string }> {
    if (!this.deps || !this.deps.modelClient) {
      throw new Error(
        'cua-lark backend not fully wired: missing ModelClient (check CUA_VLM_BASE_URL / CUA_VLM_API_KEY / CUA_VLM_MODEL in .env). 不再使用 M4 mock 路径。',
      );
    }

    const { skillRouter, skillRegistry, harnessLoop, operator, modelClient } = this.deps;

    // 1. 路由：选 skill template
    const templates = skillRegistry.list().map((s: any) => ({
      name: s.name,
      description: s.description ?? '',
      systemPrompt: s.systemPrompt ?? '',
      finishCriteria: s.finishCriteria ?? '',
      maxLoopIterations: s.maxLoopIterations ?? 30,
      toolWhitelist: s.toolWhitelist,
      sideEffects: s.sideEffects,
      fewShots: s.fewShots,
    }));

    if (templates.length === 0) {
      throw new Error('No skill templates registered');
    }

    let routed: { template: any; params: Record<string, unknown>; confidence: number };
    try {
      routed = await skillRouter.route(task.instruction, {
        model: modelClient,
        templates,
      });
    } catch (err) {
      throw new Error(`SkillRouter failed: ${err instanceof Error ? err.message : err}`);
    }

    if (signal.aborted) {
      return { success: false, reason: 'cancelled', totalTokens: 0, routedSkill: routed.template?.name ?? '' };
    }

    // 2. emit task_started 含 routedSkill
    this.eventBus.emit({
      kind: 'task_started',
      taskId: task.taskId,
      instruction: task.instruction,
      routedSkill: routed.template.name,
      startedAt: Date.now(),
    });

    // 3. 跑 HarnessLoop
    const ctx = {
      operator,
      model: modelClient,
      trace: this.traceStore,
      testRunId: task.taskId,
      parentTraceId: task.taskId,
      iteration: 0,
      params: { ...(task.params || {}), ...(routed.params || {}) },
      taskId: task.taskId,
      config: {
        maxLoopIterations: routed.template.maxLoopIterations ?? 30,
        maxTokensPerSkill: 120000,
        messageHistoryLimit: 5,
        loopDetectionThreshold: 3,
      },
      logger: {
        info: (...args: unknown[]) => console.log('[harness]', ...args),
        warn: (...args: unknown[]) => console.warn('[harness]', ...args),
        error: (...args: unknown[]) => console.error('[harness]', ...args),
      },
      signal,
    };

    const result = await harnessLoop.run(routed.template, ctx as any);

    return {
      success: result.success,
      reason: result.finishedReason,
      totalTokens: result.totalTokens,
      routedSkill: routed.template.name,
    };
  }
}

export function createTaskQueue(
  maxSize: number,
  eventBus: EventBus,
  traceStore: SqliteTraceStore,
  deps?: TaskQueueDeps,
): TaskQueue {
  return new TaskQueueImpl(maxSize, eventBus, traceStore, deps);
}
