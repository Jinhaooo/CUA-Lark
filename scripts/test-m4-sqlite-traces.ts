import { mkdirSync } from 'fs';
import { resolve } from 'path';
import { createServer } from '../packages/server/src/http/server.js';
import type { ServerConfig } from '../packages/server/src/config/ServerConfigLoader.js';
import { createEventBus } from '../packages/server/src/sse/SseBroker.js';
import { createTaskQueue } from '../packages/server/src/queue/TaskQueue.js';
import { registerTaskRoutes } from '../packages/server/src/http/routes/tasks.js';
import { registerTraceRoutes } from '../packages/server/src/http/routes/trace.js';
import { SqliteTraceStore } from '../packages/core/src/trace/SqliteTraceStore.js';
import { TracePersister } from '../packages/core/src/trace/TracePersister.js';

interface TaskResponse {
  taskId: string;
  status: string;
}

interface TaskDetail {
  id: string;
  status: string;
}

interface TraceEvent {
  kind: string;
}

const runDir = resolve('runs', `m4-sqlite-smoke-${Date.now()}`);
const dbPath = resolve(runDir, 'cua-lark.db');

const config: ServerConfig = {
  host: '127.0.0.1',
  port: 0,
  sseHeartbeatMs: 15000,
  httpClient: {
    timeoutMs: 30000,
    retries: 2,
    circuitBreaker: {
      failureThreshold: 5,
      resetMs: 30000,
    },
  },
  streaming: {
    chunkIdleTimeoutMs: 15000,
  },
  taskQueue: {
    maxSize: 10,
  },
  trace: {
    dbPath,
  },
  cors: {
    allowedOrigins: ['http://localhost:5173'],
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function getTask(server: ReturnType<typeof createServer>, taskId: string): Promise<TaskDetail> {
  const response = await server.inject({ method: 'GET', url: `/tasks/${taskId}` });
  assert(response.statusCode === 200, `GET /tasks/${taskId} failed: ${response.statusCode} ${response.body}`);
  return JSON.parse(response.body) as TaskDetail;
}

async function getTrace(server: ReturnType<typeof createServer>, taskId: string): Promise<TraceEvent[]> {
  const response = await server.inject({ method: 'GET', url: `/tasks/${taskId}/trace` });
  assert(response.statusCode === 200, `GET /tasks/${taskId}/trace failed: ${response.statusCode} ${response.body}`);
  return JSON.parse(response.body) as TraceEvent[];
}

async function waitForTaskDone(server: ReturnType<typeof createServer>, taskId: string): Promise<TaskDetail> {
  const deadline = Date.now() + 30000;

  while (Date.now() < deadline) {
    const task = await getTask(server, taskId);
    if (['completed', 'failed', 'cancelled'].includes(task.status)) {
      return task;
    }
    await sleep(500);
  }

  throw new Error(`Task ${taskId} did not finish within 30s`);
}

async function waitForTraceKinds(server: ReturnType<typeof createServer>, taskId: string, expectedKinds: string[]): Promise<TraceEvent[]> {
  const deadline = Date.now() + 5000;

  while (Date.now() < deadline) {
    const trace = await getTrace(server, taskId);
    const kinds = new Set(trace.map((event) => event.kind));
    if (expectedKinds.every((kind) => kinds.has(kind))) {
      return trace;
    }
    await sleep(200);
  }

  const trace = await getTrace(server, taskId);
  const kinds = [...new Set(trace.map((event) => event.kind))].join(', ');
  throw new Error(`Trace is missing expected kinds. expected=${expectedKinds.join(', ')} actual=${kinds}`);
}

async function main(): Promise<void> {
  mkdirSync(runDir, { recursive: true });

  const traceStore = new SqliteTraceStore(config.trace.dbPath);
  const eventBus = createEventBus();
  const tracePersister = new TracePersister(eventBus, traceStore);
  tracePersister.start();

  const taskQueue = createTaskQueue(config.taskQueue.maxSize, eventBus, traceStore);
  const server = createServer(config);

  try {
    await server.register(async (scopedServer) => {
      const routeContext = { config, eventBus, taskQueue, traceStore };
      await registerTaskRoutes(scopedServer, routeContext);
      await registerTraceRoutes(scopedServer, routeContext);
    });
    await server.ready();

    const createResponse = await server.inject({
      method: 'POST',
      url: '/tasks',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        instruction: 'M4 SQLite trace smoke test',
        params: { source: 'scripts/test-m4-sqlite-traces.ts' },
      }),
    });

    assert(createResponse.statusCode === 200, `POST /tasks failed: ${createResponse.statusCode} ${createResponse.body}`);

    const created = JSON.parse(createResponse.body) as TaskResponse;
    assert(created.taskId, 'POST /tasks did not return taskId');

    const task = await waitForTaskDone(server, created.taskId);
    assert(task.status === 'completed', `Expected completed task, got ${task.status}`);

    const trace = await waitForTraceKinds(server, created.taskId, [
      'task_started',
      'iteration_started',
      'thought_complete',
      'tool_call',
      'tool_result',
      'iteration_complete',
      'task_finished',
    ]);

    const listResponse = await server.inject({ method: 'GET', url: '/tasks?status=completed&limit=5&offset=0' });
    assert(listResponse.statusCode === 200, `GET /tasks failed: ${listResponse.statusCode} ${listResponse.body}`);

    console.log(`[m4-smoke] ok taskId=${created.taskId}`);
    console.log(`[m4-smoke] traceEvents=${trace.length}`);
    console.log(`[m4-smoke] dbPath=${dbPath}`);
  } finally {
    tracePersister.stop();
    await server.close();
    traceStore.close();
  }
}

main().catch((error) => {
  console.error('[m4-smoke] failed');
  console.error(error);
  process.exitCode = 1;
});
