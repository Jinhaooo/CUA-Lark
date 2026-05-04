import { appendFile, mkdir, stat, writeFile } from 'fs/promises';
import { mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { ulid } from 'ulid';
import type { TraceWriter } from '../../trace/types.js';
import type { TraceEvent } from '../../types.js';

export class JsonlTraceWriter implements TraceWriter {
  private baseDir: string;
  private runId?: string;

  constructor(baseDir: string = './traces') {
    this.baseDir = baseDir;
  }

  beginRun(): string {
    this.runId = ulid();
    mkdirSync(resolve(this.baseDir, this.runId, 'screenshots'), { recursive: true });
    return this.runId;
  }

  async endRun(runId: string): Promise<void> {
    if (this.runId === runId) {
      this.runId = undefined;
    }
  }

  async write(event: TraceEvent): Promise<void> {
    const runId = event.test_run_id || this.runId;
    if (!runId) {
      throw new Error('No active trace run. Call beginRun() or provide event.test_run_id.');
    }

    await this.ensureRunDir(runId);
    await appendFile(resolve(this.baseDir, runId, 'events.jsonl'), `${JSON.stringify(event)}\n`);
  }

  async saveScreenshot(runId: string, traceId: string, png: Buffer): Promise<string> {
    await this.ensureRunDir(runId);

    const screenshotDir = resolve(this.baseDir, runId, 'screenshots');
    await mkdir(screenshotDir, { recursive: true });
    await writeFile(resolve(screenshotDir, `${traceId}.png`), png);

    return join('screenshots', `${traceId}.png`).replace(/\\/g, '/');
  }

  private async ensureDir(): Promise<void> {
    try {
      await stat(this.baseDir);
    } catch {
      await mkdir(this.baseDir, { recursive: true });
    }
  }

  private async ensureRunDir(runId: string): Promise<void> {
    await this.ensureDir();
    await mkdir(resolve(this.baseDir, runId, 'screenshots'), { recursive: true });
  }
}
