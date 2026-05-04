import { describe, it, expect, beforeEach } from 'vitest';
import { EventBusImpl, HarnessStreamEvent } from '../EventBus';

describe('EventBus', () => {
  let eventBus: EventBusImpl;

  beforeEach(() => {
    eventBus = new EventBusImpl();
  });

  it('should emit and subscribe to specific task', () => {
    const taskId = 'test-task-1';
    const events: HarnessStreamEvent[] = [];
    
    const unsubscribe = eventBus.subscribe(taskId, (event) => {
      events.push(event);
    });

    const event1: HarnessStreamEvent = {
      kind: 'task_started',
      taskId,
      instruction: 'test',
      routedSkill: 'test_skill',
      startedAt: Date.now(),
    };
    
    const event2: HarnessStreamEvent = {
      kind: 'thought_chunk',
      taskId,
      iteration: 1,
      delta: 'hello',
    };

    eventBus.emit(event1);
    eventBus.emit(event2);
    
    const otherEvent: HarnessStreamEvent = {
      kind: 'task_started',
      taskId: 'other-task',
      instruction: 'other',
      routedSkill: 'other_skill',
      startedAt: Date.now(),
    };
    eventBus.emit(otherEvent);

    expect(events.length).toBe(2);
    expect(events[0].kind).toBe('task_started');
    expect(events[1].kind).toBe('thought_chunk');

    unsubscribe();
    
    eventBus.emit(event1);
    expect(events.length).toBe(2);
  });

  it('should subscribe to all events', () => {
    const events: HarnessStreamEvent[] = [];
    
    const unsubscribe = eventBus.subscribeAll((event) => {
      events.push(event);
    });

    const event1: HarnessStreamEvent = {
      kind: 'task_started',
      taskId: 'task-1',
      instruction: 'test',
      routedSkill: 'skill-1',
      startedAt: Date.now(),
    };
    
    const event2: HarnessStreamEvent = {
      kind: 'task_finished',
      taskId: 'task-2',
      success: true,
      reason: 'done',
      durationMs: 1000,
      totalTokens: 100,
    };

    eventBus.emit(event1);
    eventBus.emit(event2);

    expect(events.length).toBe(2);
    expect(events[0].taskId).toBe('task-1');
    expect(events[1].taskId).toBe('task-2');

    unsubscribe();
    
    eventBus.emit(event1);
    expect(events.length).toBe(2);
  });

  it('should handle multiple subscribers', () => {
    const taskId = 'shared-task';
    const events1: HarnessStreamEvent[] = [];
    const events2: HarnessStreamEvent[] = [];
    
    const unsubscribe1 = eventBus.subscribe(taskId, (event) => events1.push(event));
    const unsubscribe2 = eventBus.subscribe(taskId, (event) => events2.push(event));

    const event: HarnessStreamEvent = {
      kind: 'tool_call',
      taskId,
      iteration: 1,
      name: 'click',
      args: { x: 100, y: 200 },
    };

    eventBus.emit(event);

    expect(events1.length).toBe(1);
    expect(events2.length).toBe(1);
    expect(events1[0].kind).toBe('tool_call');
    expect(events2[0].kind).toBe('tool_call');

    unsubscribe1();
    unsubscribe2();
  });

  it('should not throw when listener fails', () => {
    const taskId = 'test-task';
    const errorListener = vi.fn().mockImplementation(() => {
      throw new Error('listener error');
    });
    
    eventBus.subscribe(taskId, errorListener);
    
    const event: HarnessStreamEvent = {
      kind: 'task_started',
      taskId,
      instruction: 'test',
      routedSkill: 'skill',
      startedAt: Date.now(),
    };
    
    expect(() => eventBus.emit(event)).not.toThrow();
  });
});