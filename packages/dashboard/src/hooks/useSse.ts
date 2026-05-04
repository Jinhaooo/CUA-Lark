import { useEffect, useRef, useState, useCallback } from 'react';
import type { TraceEvent } from '@/api/client';

export interface HarnessStreamEvent {
  taskId: string;
  kind: string;
  event: TraceEvent;
}

export function useSse(taskId: string | null) {
  const [events, setEvents] = useState<HarnessStreamEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const addEvent = useCallback((event: HarnessStreamEvent) => {
    setEvents((prev) => [...prev, event]);
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
