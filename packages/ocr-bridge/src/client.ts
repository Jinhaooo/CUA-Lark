import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { resolve, dirname, join } from 'path';
import type { OcrBridgeProcessConfig, OcrBridgeHealth } from './types.js';

export class OcrBridgeProcess {
  private process: ChildProcessWithoutNullStreams | null = null;
  private port: number;
  private host: string;
  private pythonPath: string;
  private serverScriptPath: string;
  private isAliveFlag: boolean = false;

  constructor(config: OcrBridgeProcessConfig = {}) {
    this.port = config.port ?? 7010;
    this.host = config.host ?? '127.0.0.1';
    this.pythonPath = config.pythonPath ?? this.detectPython();
    this.serverScriptPath = config.serverScriptPath ?? this.getDefaultServerScriptPath();
  }

  private detectPython(): string {
    const candidates = ['python3', 'python'];
    for (const candidate of candidates) {
      try {
        // We'll try to use this path and catch errors later
        return candidate;
      } catch {
        continue;
      }
    }
    return 'python';
  }

  private getDefaultServerScriptPath(): string {
    const pkgDir = dirname(resolve(__dirname, '../'));
    return join(pkgDir, 'server.py');
  }

  getBaseURL(): string {
    return `http://${this.host}:${this.port}`;
  }

  isAlive(): boolean {
    return this.isAliveFlag && this.process?.exitCode === null;
  }

  async start(): Promise<void> {
    if (this.isAlive()) {
      return;
    }

    return new Promise((resolve, reject) => {
      const env = { ...process.env, CUA_OCR_PORT: String(this.port), CUA_OCR_HOST: this.host };
      
      this.process = spawn(this.pythonPath, [this.serverScriptPath], {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.process.stdout.on('data', (data) => {
        const output = String(data);
        console.log(`[OCR Bridge] ${output.trim()}`);
        if (output.includes('Starting OCR Bridge')) {
          this.isAliveFlag = true;
          this.waitForHealth().then(resolve).catch(reject);
        }
      });

      this.process.stderr.on('data', (data) => {
        console.error(`[OCR Bridge Error] ${String(data).trim()}`);
      });

      this.process.on('exit', (code) => {
        this.isAliveFlag = false;
        console.log(`[OCR Bridge] Process exited with code ${code}`);
      });

      this.process.on('error', (error) => {
        this.isAliveFlag = false;
        reject(new Error(`Failed to start OCR bridge: ${error.message}`));
      });

      setTimeout(() => {
        if (!this.isAliveFlag) {
          this.stop();
          reject(new Error('OCR bridge startup timeout'));
        }
      }, 30000);
    });
  }

  private async waitForHealth(): Promise<void> {
    const maxAttempts = 20;
    const delayMs = 1000;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(`${this.getBaseURL()}/health`);
        const health: OcrBridgeHealth = await response.json();
        if (health.status === 'ok') {
          return;
        }
      } catch {
        // Ignore errors during polling
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    throw new Error('OCR bridge health check failed');
  }

  stop(): void {
    if (this.process && !this.process.killed) {
      this.process.kill();
    }
    this.isAliveFlag = false;
  }
}