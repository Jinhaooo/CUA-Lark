import { BrowserWindow, ipcMain } from 'electron';
import { logger } from '@main/logger';
import { sseClient } from './sseClient';

class SseDispatcher {
  private windows: Set<BrowserWindow> = new Set();

  initialize() {
    sseClient.connect();

    ipcMain.on('sse:subscribe', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) {
        this.windows.add(window);
        logger.info('[SSE Dispatcher] Window subscribed:', window.id);

        window.on('closed', () => {
          this.windows.delete(window);
          logger.info('[SSE Dispatcher] Window unsubscribed:', window.id);
        });
      }
    });

    ipcMain.on('sse:event', (_event, data) => {
      this.dispatchToAll('sse:event', data);
    });

    ipcMain.on('sse:task_paused', (_event, data) => {
      this.dispatchToAll('sse:task_paused', data);
    });

    ipcMain.on('sse:task_resumed', (_event, data) => {
      this.dispatchToAll('sse:task_resumed', data);
    });

    ipcMain.on('sse:takeover_armed', (_event, data) => {
      this.dispatchToAll('sse:takeover_armed', data);
    });

    ipcMain.on('sse:risk_confirmed', (_event, data) => {
      this.dispatchToAll('sse:risk_confirmed', data);
    });

    ipcMain.on('sse:task_started', (_event, data) => {
      this.dispatchToAll('sse:task_started', data);
    });

    ipcMain.on('sse:task_finished', (_event, data) => {
      this.dispatchToAll('sse:task_finished', data);
    });

    ipcMain.on('sse:task_failed', (_event, data) => {
      this.dispatchToAll('sse:task_failed', data);
    });

    ipcMain.on('sse:trace_updated', (_event, data) => {
      this.dispatchToAll('sse:trace_updated', data);
    });

    logger.info('[SSE Dispatcher] Initialized');
  }

  private dispatchToAll(channel: string, data: unknown) {
    this.windows.forEach((window) => {
      try {
        if (!window.isDestroyed() && window.webContents) {
          window.webContents.send(channel, data);
        }
      } catch (error) {
        logger.error('[SSE Dispatcher] Failed to dispatch to window:', error);
      }
    });
  }

  shutdown() {
    sseClient.disconnect();
    this.windows.clear();
    logger.info('[SSE Dispatcher] Shutdown');
  }
}

export const sseDispatcher = new SseDispatcher();