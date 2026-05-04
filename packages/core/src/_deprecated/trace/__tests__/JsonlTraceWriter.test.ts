import { JsonlTraceWriter } from '../JsonlTraceWriter';
import { TraceEvent } from '../../../trace/types';
import { rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

describe('JsonlTraceWriter', () => {
  const testDir = './test-traces';
  let writer: JsonlTraceWriter;

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    writer = new JsonlTraceWriter(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('beginRun returns a valid ULID', () => {
    const runId = writer.beginRun();
    expect(typeof runId).toBe('string');
    expect(runId.length).toBeGreaterThan(0);
    expect(existsSync(join(testDir, runId))).toBe(true);
    expect(existsSync(join(testDir, runId, 'screenshots'))).toBe(true);
  });

  test('write appends events to JSONL file', async () => {
    const runId = writer.beginRun();
    const event: TraceEvent = {
      id: 'test-event-id',
      test_run_id: runId,
      kind: 'skill',
      name: 'test-skill',
      status: 'running',
      started_at: Date.now(),
      payload: { test: 'data' }
    };

    await writer.write(event);
    
    const eventsFile = join(testDir, runId, 'events.jsonl');
    expect(existsSync(eventsFile)).toBe(true);
    
    const content = readFileSync(eventsFile, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(1);
    
    const parsedEvent = JSON.parse(lines[0]);
    expect(parsedEvent).toEqual(event);
  });

  test('saveScreenshot writes file and returns relative path', async () => {
    const runId = writer.beginRun();
    const traceId = 'test-trace-id';
    const pngBuffer = Buffer.from('test-png-data');

    const relativePath = await writer.saveScreenshot(runId, traceId, pngBuffer);
    
    expect(relativePath).toBe(`screenshots/${traceId}.png`);
    expect(!relativePath.includes(testDir)).toBe(true); // 确保返回相对路径
    
    const screenshotPath = join(testDir, runId, relativePath);
    expect(existsSync(screenshotPath)).toBe(true);
  });

  test('endRun completes without error', async () => {
    const runId = writer.beginRun();
    await expect(writer.endRun(runId)).resolves.not.toThrow();
  });
});