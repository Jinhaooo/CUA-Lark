/**
 * M4.2.9 · CLI thin client backend helper
 *
 * 包装：HTTP fetch + SSE 消费 + 后端自动启动检测
 * 所有 CLI commands 通过本模块调本地后端，不再直调内核。
 */

import { spawn, type ChildProcess } from 'child_process';
import { setTimeout as delay } from 'timers/promises';

const DEFAULT_HOST = process.env.CUA_BACKEND_HOST || '127.0.0.1';
const DEFAULT_PORT = Number(process.env.CUA_BACKEND_PORT || 7878);
const HEALTH_TIMEOUT_MS = 1500;
const STARTUP_TIMEOUT_MS = 30000;

export interface BackendEndpoint {
  host: string;
  port: number;
}

export function getBackendEndpoint(): BackendEndpoint {
  return { host: DEFAULT_HOST, port: DEFAULT_PORT };
}

export function backendBaseUrl(): string {
  const { host, port } = getBackendEndpoint();
  return `http://${host}:${port}`;
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), HEALTH_TIMEOUT_MS);
    const res = await fetch(`${backendBaseUrl()}/health`, { signal: ac.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 确保后端运行：检测健康；若不健康则尝试 spawn pnpm dev:server。
 * 返回 spawn 出来的子进程（如有）。CLI 退出时调用方决定是否 kill。
 *
 * 失败时抛错；CLI command 自行处理退出码。
 */
export async function ensureBackendRunning(opts?: {
  autoStart?: boolean;
  silent?: boolean;
}): Promise<{ child?: ChildProcess; alreadyRunning: boolean }> {
  const log = opts?.silent ? () => {} : (msg: string) => console.error(`[backend] ${msg}`);

  if (await checkBackendHealth()) {
    log('already running');
    return { alreadyRunning: true };
  }

  if (!opts?.autoStart) {
    throw new Error(
      `Backend not running at ${backendBaseUrl()}. Start it in another terminal:\n` +
      `  pnpm --filter @cua-lark/server dev`,
    );
  }

  log('not running; spawning pnpm --filter @cua-lark/server dev');
  const child = spawn('pnpm', ['--filter', '@cua-lark/server', 'dev'], {
    detached: false,
    stdio: opts?.silent ? 'ignore' : 'inherit',
    shell: process.platform === 'win32',
  });

  const start = Date.now();
  while (Date.now() - start < STARTUP_TIMEOUT_MS) {
    await delay(500);
    if (await checkBackendHealth()) {
      log(`up after ${Date.now() - start}ms`);
      return { child, alreadyRunning: false };
    }
    if (child.exitCode !== null) {
      throw new Error(`Backend spawn exited prematurely (code=${child.exitCode})`);
    }
  }

  child.kill();
  throw new Error(`Backend did not become healthy within ${STARTUP_TIMEOUT_MS}ms`);
}

export interface PostTaskRequest {
  instruction: string;
  params?: Record<string, unknown>;
}

export interface PostTaskResponse {
  taskId: string;
  status: 'queued';
}

export async function postTask(req: PostTaskRequest): Promise<PostTaskResponse> {
  const res = await fetch(`${backendBaseUrl()}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST /tasks failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<PostTaskResponse>;
}

export async function cancelTask(taskId: string): Promise<boolean> {
  const res = await fetch(`${backendBaseUrl()}/tasks/${taskId}`, { method: 'DELETE' });
  return res.status === 204;
}

export async function getTask(taskId: string): Promise<unknown> {
  const res = await fetch(`${backendBaseUrl()}/tasks/${taskId}`);
  if (!res.ok) throw new Error(`GET /tasks/${taskId} failed: ${res.status}`);
  return res.json();
}

export async function getTrace(taskId: string, since?: string): Promise<{ events: unknown[] }> {
  const url = new URL(`${backendBaseUrl()}/tasks/${taskId}/trace`);
  if (since) url.searchParams.set('since', since);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`GET trace failed: ${res.status}`);
  return res.json() as Promise<{ events: unknown[] }>;
}

export interface SseEvent {
  event: string;
  data: unknown;
}

export interface SseConsumeOptions {
  signal?: AbortSignal;
  onEvent: (e: SseEvent) => void | Promise<void>;
}

/**
 * 消费 GET /tasks/:id/stream 的 SSE 流，每个事件回调 onEvent。
 * 返回 Promise，在 SSE 服务端关闭连接（task_finished 后服务端 detach）或外部 abort 时 resolve。
 */
export async function subscribeSse(taskId: string, opts: SseConsumeOptions): Promise<void> {
  const url = `${backendBaseUrl()}/tasks/${taskId}/stream`;
  const res = await fetch(url, {
    headers: { Accept: 'text/event-stream' },
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw new Error(`SSE connect failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    let chunk: { done: boolean; value?: Uint8Array };
    try {
      chunk = await reader.read();
    } catch (err) {
      if (opts.signal?.aborted) return;
      throw err;
    }
    if (chunk.done) return;
    buffer += decoder.decode(chunk.value, { stream: true });

    while (true) {
      const sep = buffer.indexOf('\n\n');
      if (sep < 0) break;
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const parsed = parseSseFrame(raw);
      if (parsed) await opts.onEvent(parsed);
    }
  }
}

function parseSseFrame(raw: string): SseEvent | null {
  let event = 'message';
  let dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith(':')) continue;
    const colonIdx = line.indexOf(':');
    const field = colonIdx < 0 ? line : line.slice(0, colonIdx);
    const value = colonIdx < 0 ? '' : line.slice(colonIdx + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    else if (field === 'data') dataLines.push(value);
  }
  if (dataLines.length === 0) return null;
  const dataStr = dataLines.join('\n');
  let data: unknown;
  try {
    data = JSON.parse(dataStr);
  } catch {
    data = dataStr;
  }
  return { event, data };
}

/**
 * 高层封装：提交任务 + 订阅 SSE + 终态返回。CLI command 大多数情况用这个。
 */
export interface RunTaskOptions {
  printThoughtChunks?: boolean;
  printToolCalls?: boolean;
  signal?: AbortSignal;
}

export interface RunTaskResult {
  taskId: string;
  success: boolean;
  reason: string;
  totalTokens: number;
  durationMs: number;
}

export async function runTaskAndWait(
  req: PostTaskRequest,
  opts: RunTaskOptions = {},
): Promise<RunTaskResult> {
  const { taskId } = await postTask(req);
  console.log(`[task] submitted: ${taskId}`);
  console.log(`[task] instruction: ${req.instruction}`);

  const unregisterSigint = registerSigintCancel(taskId);

  let resolved: RunTaskResult | null = null;
  let currentIteration = 0;

  try { await subscribeSse(taskId, {
    signal: opts.signal,
    onEvent: ({ event, data }) => {
      const evt = data as { iteration?: number; delta?: string; name?: string; args?: unknown; success?: boolean; reason?: string; totalTokens?: number; durationMs?: number; full?: string; observation?: string };

      switch (event) {
        case 'iteration_started':
          currentIteration = evt.iteration ?? 0;
          if (opts.printToolCalls !== false) console.log(`\n[iter ${currentIteration}] →`);
          break;
        case 'thought_chunk':
          if (opts.printThoughtChunks !== false) process.stdout.write(evt.delta ?? '');
          break;
        case 'thought_complete':
          if (opts.printThoughtChunks !== false) process.stdout.write('\n');
          break;
        case 'thought_reset':
          if (opts.printThoughtChunks !== false) console.log('\n[thought_reset: stream interrupted, retrying]');
          break;
        case 'tool_call':
          if (opts.printToolCalls !== false) {
            console.log(`  → ${evt.name}(${truncate(JSON.stringify(evt.args ?? {}), 120)})`);
          }
          break;
        case 'tool_result':
          if (opts.printToolCalls !== false) {
            const ok = evt.success ? '✓' : '✗';
            console.log(`    ${ok} ${truncate(evt.observation ?? '', 200)} [${evt.durationMs}ms]`);
          }
          break;
        case 'task_finished':
          resolved = {
            taskId,
            success: evt.success === true,
            reason: evt.reason ?? '',
            totalTokens: evt.totalTokens ?? 0,
            durationMs: evt.durationMs ?? 0,
          };
          console.log(`\n[task] finished: success=${resolved.success} reason=${resolved.reason} tokens=${resolved.totalTokens}`);
          break;
        case 'task_failed':
          resolved = {
            taskId,
            success: false,
            reason: `task_failed: ${(evt as any).error?.message ?? 'unknown'}`,
            totalTokens: 0,
            durationMs: 0,
          };
          break;
        case 'task_cancelled':
          resolved = { taskId, success: false, reason: 'cancelled', totalTokens: 0, durationMs: 0 };
          console.log('\n[task] cancelled');
          break;
      }
    },
  });
  } finally {
    unregisterSigint();
  }

  if (!resolved) {
    throw new Error(`SSE closed without task_finished for task ${taskId}`);
  }
  return resolved;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n)}…`;
}

/**
 * 注册 SIGINT 自动取消任务（用户 Ctrl+C）。
 * 返回 unsubscribe 函数。
 */
export function registerSigintCancel(taskId: string): () => void {
  const handler = async () => {
    console.error('\n[task] SIGINT received; cancelling...');
    try {
      await cancelTask(taskId);
    } catch (err) {
      console.error('[task] cancel failed:', err);
    } finally {
      process.exit(130);
    }
  };
  process.on('SIGINT', handler);
  return () => process.off('SIGINT', handler);
}
