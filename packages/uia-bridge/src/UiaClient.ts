import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import type { UiaElement, UiaFindSpec, UiaHealthResult, UiaRole } from './types.js';

interface JsonRpcRequest {
  id: string;
  method: string;
  params: Record<string, unknown>;
}

interface JsonRpcResponse {
  id: string;
  result?: unknown;
  error?: { code: string; message: string };
}

export class UiaClient {
  private process: ChildProcessWithoutNullStreams | null = null;
  private pendingRequests = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private isWindows = process.platform === 'win32';
  private dpiScale = 1;

  constructor(private timeoutMs = 10000) {
    if (this.isWindows) {
      this.initPowerShell();
    }
  }

  private initPowerShell(): void {
    try {
      this.process = spawn(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', this.getScriptPath()],
        { windowsHide: true }
      );

      this.process.stdout.on('data', (data) => {
        const lines = String(data).split('\n').filter((l: string) => l.trim());
        for (const line of lines) {
          try {
            const response: JsonRpcResponse = JSON.parse(line);
            const pending = this.pendingRequests.get(response.id);
            if (pending) {
              if (response.error) {
                pending.reject(new Error(response.error.message));
              } else {
                pending.resolve(response.result);
              }
              this.pendingRequests.delete(response.id);
            }
          } catch {}
        }
      });

      this.process.on('error', () => {
        this.process = null;
      });

      this.process.on('close', () => {
        this.process = null;
      });
    } catch {
      this.process = null;
    }
  }

  private getScriptPath(): string {
    const scriptDir = new URL('.', import.meta.url).pathname.replace(/^\/(.):/, '$1:');
    return `${scriptDir}\\server.ps1`;
  }

  private async sendRequest(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.isWindows || !this.process) {
      return null;
    }

    return new Promise((resolve, reject) => {
      const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const request: JsonRpcRequest = { id, method, params };

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`UIA request ${method} timed out`));
      }, this.timeoutMs);

      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.process?.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  async isA11yEnabled(): Promise<UiaHealthResult> {
    if (!this.isWindows) {
      return { enabled: false, nodeCount: 0 };
    }

    try {
      const result = await this.sendRequest('isA11yEnabled', {}) as UiaHealthResult;
      return result ?? { enabled: false, nodeCount: 0 };
    } catch {
      return { enabled: false, nodeCount: 0 };
    }
  }

  async waitForA11yEnabled(timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const result = await this.isA11yEnabled();
      if (result.enabled && result.nodeCount >= 50) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }

  async findElement(spec: UiaFindSpec): Promise<UiaElement | null> {
    if (!this.isWindows) {
      return null;
    }

    try {
      const params: Record<string, unknown> = {
        role: spec.role,
        name: typeof spec.name === 'string' ? spec.name : spec.name.source,
        scope: spec.scope ?? 'descendants',
      };

      const result = await this.sendRequest('findElement', params) as UiaElement | null;
      if (!result) {
        return null;
      }

      const box = result.boundingRectangle;
      result.boundingRectangle = {
        x: Math.round(box.x * this.dpiScale),
        y: Math.round(box.y * this.dpiScale),
        width: Math.round(box.width * this.dpiScale),
        height: Math.round(box.height * this.dpiScale),
      };

      return result;
    } catch {
      return null;
    }
  }

  async findAll(spec: { role: UiaRole; name?: string | RegExp }): Promise<UiaElement[]> {
    if (!this.isWindows) {
      return [];
    }

    try {
      const params: Record<string, unknown> = {
        role: spec.role,
        name: spec.name ? (typeof spec.name === 'string' ? spec.name : spec.name.source) : '',
      };

      const result = await this.sendRequest('findAll', params) as UiaElement[];
      return result ?? [];
    } catch {
      return [];
    }
  }

  async shutdown(): Promise<void> {
    if (!this.process) {
      return;
    }

    try {
      await this.sendRequest('shutdown', {});
    } catch {}

    if (!this.process.killed) {
      this.process.kill();
    }
    this.process = null;
  }
}