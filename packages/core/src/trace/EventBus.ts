import { EventEmitter } from 'events';

export type HarnessStreamEvent =
  | { kind: 'task_started'; taskId: string; instruction: string; routedSkill: string; startedAt: number }
  | { kind: 'task_finished'; taskId: string; success: boolean; reason: string; durationMs: number; totalTokens: number }
  | { kind: 'task_failed'; taskId: string; error: { kind: string; message: string } }
  | { kind: 'task_cancelled'; taskId: string }
  | { kind: 'iteration_started'; taskId: string; iteration: number; screenshotPath: string }
  | { kind: 'model_request_started'; taskId: string; iteration: number; attempt: number; timeoutMs: number }
  | { kind: 'model_request_finished'; taskId: string; iteration: number; attempt: number; durationMs: number; success: boolean; reason?: string }
  | { kind: 'thought_chunk'; taskId: string; iteration: number; delta: string }
  | { kind: 'thought_complete'; taskId: string; iteration: number; full: string; tokens: number }
  | { kind: 'thought_reset'; taskId: string; iteration: number; reason: 'stream_interrupted' }
  | { kind: 'tool_call'; taskId: string; iteration: number; name: string; args: unknown }
  | { kind: 'tool_result'; taskId: string; iteration: number; success: boolean; observation: string; durationMs: number }
  | { kind: 'iteration_complete'; taskId: string; iteration: number; durationMs: number; cost: { tokens: number } }
  | { kind: 'skill_started'; taskId: string; skillName: string }
  | { kind: 'skill_finished'; taskId: string; skillName: string; success: boolean; iterations: number }
  | { kind: 'sse_subscriber_attached'; taskId: string; subscriberId: string }
  | { kind: 'sse_subscriber_detached'; taskId: string; subscriberId: string; reason: 'client_close' | 'task_finished' };

export interface EventBus {
  emit(event: HarnessStreamEvent): void;
  subscribe(taskId: string, listener: (event: HarnessStreamEvent) => void): () => void;
  subscribeAll(listener: (event: HarnessStreamEvent) => void): () => void;
}

export class EventBusImpl implements EventBus {
  private emitter = new EventEmitter();
  private allListeners = new Set<(event: HarnessStreamEvent) => void>();

  emit(event: HarnessStreamEvent): void {
    try {
      const taskTopic = `harness:${event.taskId}`;
      this.emitter.emit(taskTopic, event);

      for (const listener of this.allListeners) {
        try {
          listener(event);
        } catch (error) {
          console.error('EventBus listener error:', error);
        }
      }
    } catch (error) {
      console.error('EventBus emit error:', error);
    }
  }

  subscribe(taskId: string, listener: (event: HarnessStreamEvent) => void): () => void {
    const taskTopic = `harness:${taskId}`;
    this.emitter.on(taskTopic, listener);
    
    return () => {
      this.emitter.off(taskTopic, listener);
    };
  }

  subscribeAll(listener: (event: HarnessStreamEvent) => void): () => void {
    this.allListeners.add(listener);
    
    return () => {
      this.allListeners.delete(listener);
    };
  }
}
