import type { TraceEvent, TraceWriter } from './types.js';
import { ulid } from 'ulid';
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import { join } from 'path';

export class JsonlTraceWriter implements TraceWriter {
  private tracesDir: string;

  constructor(tracesDir: string = './traces') {
    this.tracesDir = tracesDir;
  }

  beginRun(): string {
    const runId = ulid();
    const runDir = join(this.tracesDir, runId);
    const screenshotsDir = join(runDir, 'screenshots');
    
    mkdirSync(screenshotsDir, { recursive: true });
    
    return runId;
  }

  async write(event: TraceEvent): Promise<void> {
    const runDir = join(this.tracesDir, event.test_run_id);
    const eventsFile = join(runDir, 'events.jsonl');
    
    appendFileSync(eventsFile, JSON.stringify(event) + '\n');
  }

  async endRun(runId: string): Promise<void> {
    // 可以在这里添加清理或总结逻辑
  }

  async saveScreenshot(runId: string, traceId: string, png: Buffer): Promise<string> {
    const screenshotsDir = join(this.tracesDir, runId, 'screenshots');
    const screenshotPath = join(screenshotsDir, `${traceId}.png`);
    
    writeFileSync(screenshotPath, png);
    
    // 返回相对路径
    return `screenshots/${traceId}.png`;
  }
}
