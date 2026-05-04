import type { HarnessStreamEvent } from '@cua-lark/core/src/trace/EventBus.js';
import type { FastifyReply } from 'fastify';
import { ulid } from 'ulid';

export interface EventBus {
  emit(event: HarnessStreamEvent): void;
  subscribe(taskId: string, listener: (event: HarnessStreamEvent) => void): () => void;
  subscribeAll(listener: (event: HarnessStreamEvent) => void): () => void;
}

export interface SseSubscriber {
  taskId: string;
  subscriberId: string;
  reply: FastifyReply;
  heartbeat: ReturnType<typeof setInterval>;
}

export class EventBusImpl implements EventBus {
  private subscribers = new Map<string, Set<(event: HarnessStreamEvent) => void>>();
  private allListeners = new Set<(event: HarnessStreamEvent) => void>();

  emit(event: HarnessStreamEvent): void {
    const taskSubscribers = this.subscribers.get(event.taskId);
    if (taskSubscribers) {
      for (const listener of taskSubscribers) {
        try {
          listener(event);
        } catch {
        }
      }
    }

    for (const listener of this.allListeners) {
      try {
        listener(event);
      } catch {
      }
    }
  }

  subscribe(taskId: string, listener: (event: HarnessStreamEvent) => void): () => void {
    let subscribers = this.subscribers.get(taskId);
    if (!subscribers) {
      subscribers = new Set();
      this.subscribers.set(taskId, subscribers);
    }
    subscribers.add(listener);

    return () => {
      subscribers?.delete(listener);
      if (subscribers?.size === 0) {
        this.subscribers.delete(taskId);
      }
    };
  }

  subscribeAll(listener: (event: HarnessStreamEvent) => void): () => void {
    this.allListeners.add(listener);
    return () => {
      this.allListeners.delete(listener);
    };
  }
}

export class SseBroker {
  private subscribers = new Map<string, Map<string, SseSubscriber>>();

  constructor(private eventBus: EventBus) {}

  attach(taskId: string, reply: FastifyReply): string {
    const subscriberId = ulid();
    
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');
    reply.hijack();

    const heartbeat = setInterval(() => {
      try {
        reply.raw.write('event: ping\ndata: {}\n\n');
      } catch {
        this.detach(taskId, subscriberId);
      }
    }, 15000);

    let taskSubscribers = this.subscribers.get(taskId);
    if (!taskSubscribers) {
      taskSubscribers = new Map();
      this.subscribers.set(taskId, taskSubscribers);
    }

    const subscriber: SseSubscriber = { taskId, subscriberId, reply, heartbeat };
    taskSubscribers.set(subscriberId, subscriber);

    const unsubscribe = this.eventBus.subscribe(taskId, (event) => {
      this.broadcast(taskId, event);
    });

    reply.raw.on('close', () => {
      unsubscribe();
      this.detach(taskId, subscriberId);
    });

    return subscriberId;
  }

  detach(taskId: string, subscriberId: string): void {
    const taskSubscribers = this.subscribers.get(taskId);
    if (!taskSubscribers) return;

    const subscriber = taskSubscribers.get(subscriberId);
    if (subscriber) {
      clearInterval(subscriber.heartbeat);
      taskSubscribers.delete(subscriberId);

      if (taskSubscribers.size === 0) {
        this.subscribers.delete(taskId);
      }
    }
  }

  broadcast(taskId: string, event: HarnessStreamEvent): void {
    const taskSubscribers = this.subscribers.get(taskId);
    if (!taskSubscribers) return;

    const data = JSON.stringify(event);
    const message = `event: ${event.kind}\ndata: ${data}\n\n`;

    for (const [subscriberId, subscriber] of taskSubscribers) {
      try {
        subscriber.reply.raw.write(message);
      } catch {
        this.detach(taskId, subscriberId);
      }
    }
  }

  getSubscriberCount(taskId: string): number {
    return this.subscribers.get(taskId)?.size ?? 0;
  }
}

export function createEventBus(): EventBus {
  return new EventBusImpl();
}

export function createSseBroker(eventBus: EventBus): SseBroker {
  return new SseBroker(eventBus);
}