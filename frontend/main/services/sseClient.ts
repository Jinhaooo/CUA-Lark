import { ipcMain } from 'electron';
import EventSourcePolyfill from 'eventsource';
import { logger } from '@main/logger';
import * as env from '@main/env';

// Electron 34's bundled Node (v20.x) has no built-in `EventSource`. Use the
// `eventsource` polyfill in the main process; the renderer side (Chromium)
// can still use native EventSource.
const EventSource = (globalThis as { EventSource?: typeof EventSourcePolyfill }).EventSource ?? EventSourcePolyfill;

class SseClient {
  private eventSource: InstanceType<typeof EventSourcePolyfill> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;

  connect() {
    if (this.eventSource) {
      this.eventSource.close();
    }

    const url = `${env.serverUrl}/stream`;
    logger.info('[SSE] Connecting to stream:', url);

    this.eventSource = new EventSource(url);

    this.eventSource.onopen = () => {
      logger.info('[SSE] Connection opened');
      this.reconnectDelay = 1000;
    };

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleEvent(data);
      } catch (error) {
        logger.error('[SSE] Failed to parse message:', error);
      }
    };

    this.eventSource.onerror = (error) => {
      logger.error('[SSE] Connection error:', error);
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    logger.info(`[SSE] Reconnecting in ${this.reconnectDelay}ms...`);
    setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);

    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  private handleEvent(event: unknown) {
    ipcMain.emit('sse:event', event);

    const eventObj = event as Record<string, unknown>;
    const eventKind = eventObj.kind as string;

    switch (eventKind) {
      case 'task_paused':
        ipcMain.emit('sse:task_paused', event);
        break;
      case 'task_resumed':
        ipcMain.emit('sse:task_resumed', event);
        break;
      case 'takeover_armed':
        ipcMain.emit('sse:takeover_armed', event);
        break;
      case 'risk_confirmed':
        ipcMain.emit('sse:risk_confirmed', event);
        break;
      case 'task_started':
        ipcMain.emit('sse:task_started', event);
        break;
      case 'task_finished':
        ipcMain.emit('sse:task_finished', event);
        break;
      case 'task_failed':
        ipcMain.emit('sse:task_failed', event);
        break;
      case 'trace_updated':
        ipcMain.emit('sse:trace_updated', event);
        break;
    }
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}

export const sseClient = new SseClient();