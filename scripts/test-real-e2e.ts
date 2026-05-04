import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { randomUUID } from 'crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { LarkOperator } from '../packages/core/src/operator/LarkOperator.js';
import { ModelClientImpl } from '../packages/core/src/model/ModelClient.js';
import { loadModelEnv } from '../packages/core/src/model/env.js';
import { HarnessLoop } from '../packages/core/src/harness/HarnessLoop.js';
import type { HarnessContext, SkillTemplate } from '../packages/core/src/harness/types.js';
import { ToolRegistry } from '../packages/core/src/tools/ToolRegistry.js';
import type { Tool, ToolResult } from '../packages/core/src/tools/types.js';
import {
  screenshotTool,
  uiaFindTool,
  uiaFindAllTool,
  vlmLocateTool,
  readStateTool,
  clickTool,
  doubleClickTool,
  rightClickTool,
  typeTool,
  hotkeyTool,
  scrollTool,
  dragTool,
  waitTool,
  verifyVlmTool,
  finishedTool,
  callUserTool,
  recordEvidenceTool,
} from '../packages/core/src/tools/index.js';
import { EventBusImpl } from '../packages/core/src/trace/EventBus.js';
import { TracePersister } from '../packages/core/src/trace/TracePersister.js';
import { SqliteTraceStore } from '../packages/core/src/trace/SqliteTraceStore.js';
import type { TraceEvent, TraceWriter } from '../packages/core/src/types.js';
import { UiaClient } from '../packages/uia-bridge/src/UiaClient.js';

interface CliOptions {
  prompt: string;
  dbPath: string;
  maxIterations: number;
  modelTimeoutMs: number;
  vlmModel?: string;
  noUia: boolean;
}

class SqliteTraceWriter implements TraceWriter {
  constructor(private store: SqliteTraceStore, private baseDir: string) {}

  beginRun(): string {
    return createId();
  }

  async write(event: TraceEvent): Promise<void> {
    await this.store.appendStreaming(event);
  }

  async endRun(_runId: string): Promise<void> {}

  async saveScreenshot(runId: string, traceId: string, png: Buffer): Promise<string> {
    const relativePath = `screenshots/${runId}/${traceId}.png`;
    const fullPath = resolve(this.baseDir, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, png);
    return relativePath.replace(/\\/g, '/');
  }
}

function parseArgs(argv: string[]): CliOptions {
  let dbPath = './traces/cua-lark-e2e.db';
  let maxIterations = 30;
  let modelTimeoutMs = 90000;
  let vlmModel: string | undefined;
  let noUia = false;
  const promptParts: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--db-path') {
      dbPath = argv[++i] ?? dbPath;
    } else if (arg === '--max-iterations') {
      const value = Number(argv[++i]);
      if (Number.isFinite(value) && value > 0) {
        maxIterations = value;
      }
    } else if (arg === '--vlm-model') {
      vlmModel = argv[++i];
    } else if (arg === '--model-timeout-ms') {
      const value = Number(argv[++i]);
      if (Number.isFinite(value) && value > 0) {
        modelTimeoutMs = value;
      }
    } else if (arg === '--no-uia') {
      noUia = true;
    } else if (arg === '--') {
      continue;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg) {
      promptParts.push(arg);
    }
  }

  const prompt = promptParts.join(' ').trim();
  if (!prompt) {
    printUsage();
    throw new Error('prompt cannot be empty');
  }

  return {
    prompt,
    dbPath,
    maxIterations,
    modelTimeoutMs,
    vlmModel,
    noUia,
  };
}

function printUsage(): void {
  console.log(`Usage:
  pnpm test:e2e:real -- "打开 CUA-Lark-Test 群，但不要发送消息"

Options:
  --db-path <path>          SQLite trace database path. Default: ./traces/cua-lark-e2e.db
  --max-iterations <n>     HarnessLoop max iterations. Default: 30
  --model-timeout-ms <n>   Per-iteration model request timeout. Default: 90000
  --vlm-model <model>      Override CUA_VLM_MODEL for this run
  --no-uia                 Disable UIA helper tools

Controls:
  ESC                      request cancellation and exit with code 130
`);
}

function registerEscAbort(controller: AbortController, onAbort: () => void): () => void {
  const stdin = process.stdin;
  const wasRaw = stdin.isRaw;
  let globalEscProcess: ChildProcessWithoutNullStreams | null = null;

  const abort = () => {
    if (!controller.signal.aborted) {
      controller.abort();
      onAbort();
    }
  };

  const onData = (chunk: Buffer) => {
    if (chunk.includes(0x1b)) abort();
  };

  if (stdin.isTTY) {
    stdin.setRawMode(true);
    stdin.resume();
  }
  stdin.on('data', onData);

  if (process.platform === 'win32') {
    globalEscProcess = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class KeyboardPoll {
  [DllImport("user32.dll")]
  public static extern short GetAsyncKeyState(int vKey);
}
'@;
$started = Get-Date;
$wasDown = (([KeyboardPoll]::GetAsyncKeyState(0x1B) -band 0x8000) -ne 0);
while ($true) {
  Start-Sleep -Milliseconds 80;
  $down = (([KeyboardPoll]::GetAsyncKeyState(0x1B) -band 0x8000) -ne 0);
  $elapsedMs = ((Get-Date) - $started).TotalMilliseconds;
  if ($down -and -not $wasDown -and $elapsedMs -gt 1000) {
    Write-Output "ESC";
    break;
  }
  $wasDown = $down;
}
`,
    ], { windowsHide: true });

    globalEscProcess.stdout.on('data', (data) => {
      if (String(data).includes('ESC')) abort();
    });
  }

  return () => {
    stdin.off('data', onData);
    if (globalEscProcess && !globalEscProcess.killed) {
      globalEscProcess.kill();
    }
    if (stdin.isTTY) {
      stdin.setRawMode(wasRaw);
      stdin.pause();
    }
  };
}

function registerTools(registry: ToolRegistry): void {
  const tools: Tool[] = [
    screenshotTool,
    uiaFindTool,
    uiaFindAllTool,
    vlmLocateTool,
    readStateTool,
    clickTool,
    doubleClickTool,
    rightClickTool,
    typeTool,
    hotkeyTool,
    scrollTool,
    dragTool,
    waitTool,
    verifyVlmTool,
    finishedTool,
    callUserTool,
    recordEvidenceTool,
  ];

  for (const tool of tools) {
    registry.register(tool);
  }
}

function createTemplate(prompt: string, registry: ToolRegistry, maxIterations: number): SkillTemplate {
  const toolWhitelist = registry.list().map((tool) => tool.name);
  const toolsSection = registry.toSystemPromptSection(toolWhitelist);

  return {
    name: 'real_e2e_prompt',
    description: 'Run one real GUI end-to-end prompt through HarnessLoop.',
    toolWhitelist,
    maxLoopIterations: maxIterations,
    finishCriteria: 'Call finished only after the user task is actually complete, or when blocked with a clear reason.',
    systemPrompt: `You are CUA-Lark, a desktop GUI agent controlling Feishu/Lark on Windows.

User task:
${prompt}

Rules:
- Use the screenshot each iteration to decide the next action.
- Prefer precise click/type/hotkey/wait actions.
- You may use read_state or vlm_locate when visual state is unclear.
- Do not claim success until the target state is visible or strongly verified.
- Never close, minimize, or exit the Feishu/Lark window unless the user explicitly asks to close it.
- The only completion tool is "finished"; tools named "terminate", "done", or "complete" do not exist.
- If the task says to send a message and then recall/delete/撤回 it, sending the message is only an intermediate step. You must recall that exact newly sent message and verify it is no longer visible before calling finished.
- For recalling a newly sent message, prefer right-clicking or opening the context menu on your own latest message, then choosing the recall/撤回 option.
- Always respond with a single JSON object containing "thought" and "tool_call".

${toolsSection}`,
  };
}

function logEvent(event: { kind: string; iteration?: number; delta?: string; name?: string; args?: unknown; success?: boolean; observation?: string; reason?: string; totalTokens?: number }): void {
  switch (event.kind) {
    case 'iteration_started':
      console.log(`\n[iter ${event.iteration}]`);
      break;
    case 'thought_chunk':
      if (event.delta) process.stdout.write(event.delta);
      break;
    case 'thought_complete':
      process.stdout.write('\n');
      break;
    case 'tool_call':
      console.log(`  -> ${event.name}(${truncate(JSON.stringify(event.args ?? {}), 160)})`);
      break;
    case 'tool_result':
      console.log(`     ${event.success ? 'ok' : 'fail'} ${truncate(event.observation ?? '', 220)}`);
      break;
    case 'task_finished':
      console.log(`\n[task] finished success=${event.success} reason=${event.reason} tokens=${event.totalTokens ?? 0}`);
      break;
    case 'task_cancelled':
      console.log('\n[task] cancelled');
      break;
  }
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const taskId = createId();
  const startedAt = Date.now();
  const abortController = new AbortController();
  const modelEnv = loadModelEnv();
  const model = new ModelClientImpl(modelEnv.vlm, modelEnv.llm);
  const store = new SqliteTraceStore(options.dbPath);
  const traceWriter = new SqliteTraceWriter(store, dirname(resolve(options.dbPath)));
  const eventBus = new EventBusImpl();
  const persister = new TracePersister(eventBus, store);
  const operator = new LarkOperator();
  const registry = new ToolRegistry();
  let uia: UiaClient | undefined;

  registerTools(registry);
  operator.setToolRegistry(registry);

  if (!options.noUia) {
    uia = new UiaClient(5000);
    operator.setUiaClient(uia);
  }

  persister.start();
  eventBus.subscribe(taskId, (event) => logEvent(event as any));

  const cleanupEsc = registerEscAbort(abortController, () => {
    void store.updateTaskStatus(taskId, 'cancelled', {
      finishedAt: Date.now(),
      finishedReason: 'esc_cancelled',
    });
    eventBus.emit({ kind: 'task_cancelled', taskId });
    setTimeout(() => {
      if (abortController.signal.aborted) {
        console.error('[task] forced exit after ESC');
        process.exit(130);
      }
    }, 2500).unref();
  });

  await store.upsertTask({
    id: taskId,
    instruction: options.prompt,
    params: JSON.stringify({
      prompt: options.prompt,
      maxIterations: options.maxIterations,
      modelTimeoutMs: options.modelTimeoutMs,
      vlmModel: options.vlmModel,
      dbPath: options.dbPath,
    }),
    status: 'running',
    enqueuedAt: startedAt,
    startedAt,
    routedSkill: 'real_e2e_prompt',
  });

  eventBus.emit({
    kind: 'task_started',
    taskId,
    instruction: options.prompt,
    routedSkill: 'real_e2e_prompt',
    startedAt,
  });

  console.log(`[task] started: ${taskId}`);
  console.log(`[task] db: ${resolve(options.dbPath)}`);
  console.log('[task] press ESC to cancel');

  const ctx: HarnessContext = {
    operator,
    model,
    uia,
    trace: traceWriter,
    testRunId: taskId,
    parentTraceId: taskId,
    iteration: 0,
    params: { prompt: options.prompt },
    config: {
      maxLoopIterations: options.maxIterations,
      maxTokensPerSkill: 120000,
      vlmModel: options.vlmModel,
      messageHistoryLimit: 6,
      loopDetectionThreshold: 4,
      modelRequestTimeoutMs: options.modelTimeoutMs,
    },
    logger: {
      info: (...args: unknown[]) => console.log(...args),
      warn: (...args: unknown[]) => console.warn(...args),
      error: (...args: unknown[]) => console.error(...args),
    },
  };

  const loop = new HarnessLoop(registry, eventBus);

  try {
    const result = await loop.run(createTemplate(options.prompt, registry, options.maxIterations), ctx, abortController.signal);
    const status = abortController.signal.aborted
      ? 'cancelled'
      : result.success
        ? 'completed'
        : 'failed';

    await store.updateTaskStatus(taskId, status, {
      finishedAt: Date.now(),
      finishedReason: result.finishedReason,
      totalTokens: result.totalTokens,
    });

    process.exitCode = result.success ? 0 : 1;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await store.updateTaskStatus(taskId, abortController.signal.aborted ? 'cancelled' : 'failed', {
      finishedAt: Date.now(),
      finishedReason: reason,
    });
    if (!abortController.signal.aborted) {
      eventBus.emit({
        kind: 'task_finished',
        taskId,
        success: false,
        reason,
        durationMs: Date.now() - startedAt,
        totalTokens: 0,
      });
    }
    console.error(`[task] failed: ${reason}`);
    process.exitCode = abortController.signal.aborted ? 130 : 1;
  } finally {
    cleanupEsc();
    persister.stop();
    await uia?.shutdown();
    store.close();
  }
}

main().catch((error) => {
  console.error('[task] fatal:', error);
  process.exitCode = 1;
});

function createId(): string {
  return `${Date.now().toString(36)}-${randomUUID()}`;
}
