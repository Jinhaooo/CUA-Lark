import type { EventBus, HarnessStreamEvent } from './EventBus.js';
import type { TraceStore } from './types.js';
import { ulid } from 'ulid';

export class TracePersister {
  private unsubscribe?: () => void;

  constructor(private eventBus: EventBus, private traceStore: TraceStore) {
  }

  start(): void {
    this.unsubscribe = this.eventBus.subscribeAll((event) => {
      this.handleEvent(event);
    });
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  private async handleEvent(event: HarnessStreamEvent): Promise<void> {
    if (event.kind === 'thought_chunk') {
      return;
    }

    try {
      const traceEvent = this.convertToTraceEvent(event);
      if (traceEvent) {
        await this.traceStore.appendStreaming(traceEvent);
      }
    } catch (error) {
      console.error('TracePersister error:', error);
    }
  }

  private convertToTraceEvent(event: HarnessStreamEvent): import('./types.js').TraceEvent | null {
    const status = this.getStatus(event);
    
    switch (event.kind) {
      case 'task_started':
        return {
          id: ulid(),
          test_run_id: event.taskId,
          kind: 'task_started',
          name: 'task_started',
          status,
          started_at: event.startedAt,
          payload: {
            instruction: event.instruction,
            routedSkill: event.routedSkill,
          },
        };
      case 'task_finished':
        return {
          id: ulid(),
          test_run_id: event.taskId,
          kind: 'task_finished',
          name: 'task_finished',
          status: event.success ? 'passed' : 'failed',
          started_at: Date.now(),
          ended_at: Date.now(),
          payload: {
            success: event.success,
            reason: event.reason,
            durationMs: event.durationMs,
            totalTokens: event.totalTokens,
          },
        };
      case 'task_cancelled':
        return {
          id: ulid(),
          test_run_id: event.taskId,
          kind: 'task_cancelled',
          name: 'task_cancelled',
          status: 'failed',
          started_at: Date.now(),
          ended_at: Date.now(),
        };
      case 'iteration_started':
        return {
          id: ulid(),
          test_run_id: event.taskId,
          kind: 'iteration_started',
          name: 'iteration_started',
          status,
          started_at: Date.now(),
          payload: {
            iteration: event.iteration,
            screenshotPath: event.screenshotPath,
          },
        };
      case 'model_request_started':
        return {
          id: ulid(),
          test_run_id: event.taskId,
          kind: 'model_request_started' as any,
          name: 'model_request_started',
          status,
          started_at: Date.now(),
          payload: {
            iteration: event.iteration,
            attempt: event.attempt,
            timeoutMs: event.timeoutMs,
          },
        };
      case 'model_request_finished':
        return {
          id: ulid(),
          test_run_id: event.taskId,
          kind: 'model_request_finished' as any,
          name: 'model_request_finished',
          status: event.success ? 'passed' : 'failed',
          started_at: Date.now(),
          ended_at: Date.now(),
          payload: {
            iteration: event.iteration,
            attempt: event.attempt,
            durationMs: event.durationMs,
            reason: event.reason,
          },
        };
      case 'thought_complete':
        return {
          id: ulid(),
          test_run_id: event.taskId,
          kind: 'thought_complete',
          name: 'thought_complete',
          status,
          started_at: Date.now(),
          ended_at: Date.now(),
          payload: {
            iteration: event.iteration,
            thought: event.full,
            tokens: event.tokens,
          },
        };
      case 'tool_call':
        return {
          id: ulid(),
          test_run_id: event.taskId,
          kind: 'tool_call',
          name: event.name,
          status,
          started_at: Date.now(),
          payload: {
            iteration: event.iteration,
            name: event.name,
            args: event.args,
          },
        };
      case 'tool_result':
        return {
          id: ulid(),
          test_run_id: event.taskId,
          kind: 'tool_result',
          name: 'tool_result',
          status: event.success ? 'passed' : 'failed',
          started_at: Date.now(),
          ended_at: Date.now(),
          payload: {
            iteration: event.iteration,
            observation: event.observation,
            durationMs: event.durationMs,
          },
        };
      case 'iteration_complete':
        return {
          id: ulid(),
          test_run_id: event.taskId,
          kind: 'iteration_complete',
          name: 'iteration_complete',
          status,
          started_at: Date.now(),
          ended_at: Date.now(),
          payload: {
            iteration: event.iteration,
            durationMs: event.durationMs,
            tokens: event.cost.tokens,
          },
        };
      case 'skill_started':
        return {
          id: ulid(),
          test_run_id: event.taskId,
          kind: 'skill_started',
          name: event.skillName,
          status,
          started_at: Date.now(),
          payload: {
            skillName: event.skillName,
          },
        };
      case 'skill_finished':
        return {
          id: ulid(),
          test_run_id: event.taskId,
          kind: 'skill_finished',
          name: event.skillName,
          status: event.success ? 'passed' : 'failed',
          started_at: Date.now(),
          ended_at: Date.now(),
          payload: {
            skillName: event.skillName,
            iterations: event.iterations,
          },
        };
      default:
        return null;
    }
  }

  private getStatus(event: HarnessStreamEvent): 'running' | 'passed' | 'failed' {
    switch (event.kind) {
      case 'task_finished':
        return event.success ? 'passed' : 'failed';
      case 'task_cancelled':
        return 'failed';
      case 'tool_result':
        return event.success ? 'passed' : 'failed';
      case 'skill_finished':
        return event.success ? 'passed' : 'failed';
      default:
        return 'running';
    }
  }
}
