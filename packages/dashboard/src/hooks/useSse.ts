import { useEffect, useRef, useState, useCallback } from 'react';
import type { TraceEvent } from '@/api/client';

export interface HarnessStreamEvent {
  taskId: string;
  kind: string;
  event: TraceEvent;
  [key: string]: unknown;
}

export function useSse(taskId: string | null) {
  const [events, setEvents] = useState<HarnessStreamEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const addEvent = useCallback((event: any) => {
    const normalized = event.event ? event : { ...event, event };
    setEvents((prev) => [...prev, normalized]);
  }, []);

  useEffect(() => {
    if (!taskId) {
      setEvents([]);
      return;
    }

    const eventSource = new EventSource(`/api/tasks/${taskId}/stream`);

    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onerror = () => {
      setIsConnected(false);
    };

    eventSource.addEventListener('thought_chunk', (event) => {
      try {
        const data = JSON.parse(event.data);
        addEvent(data);
      } catch {
      }
    });

    eventSource.addEventListener('task_started', (event) => {
      try {
        const data = JSON.parse(event.data);
        addEvent(data);
      } catch {
      }
    });

    eventSource.addEventListener('task_finished', (event) => {
      try {
        const data = JSON.parse(event.data);
        addEvent(data);
      } catch {
      }
    });

    eventSource.addEventListener('tool_call', (event) => {
      try {
        const data = JSON.parse(event.data);
        addEvent(data);
      } catch {
      }
    });

    eventSource.addEventListener('tool_result', (event) => {
      try {
        const data = JSON.parse(event.data);
        addEvent(data);
      } catch {
      }
    });

    for (const eventName of [
      'risk_confirmation_required',
      'risk_confirmation_received',
      'risk_approved',
      'self_healing_attempted',
      'self_healing_succeeded',
      'self_healing_skipped',
    ]) {
      eventSource.addEventListener(eventName, (event) => {
        try {
          const data = JSON.parse(event.data);
          addEvent(data);
        } catch {
        }
      });
    }

    eventSource.addEventListener('ping', () => {
    });

    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, [taskId, addEvent]);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  return { events, isConnected, clearEvents };
}
