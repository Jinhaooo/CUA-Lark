import type { FastifyInstance } from 'fastify';
import type { ServerConfig } from '../../config/ServerConfigLoader.js';
import type { EventBus } from '../../sse/SseBroker.js';
import type { TaskQueue } from '../../queue/TaskQueue.js';
import type { SqliteTraceStore } from '@cua-lark/core/src/trace/SqliteTraceStore.js';
import type { EmbeddingClient } from '@cua-lark/core/src/data/EmbeddingClient.js';
import type { FewShotMiner } from '@cua-lark/core/src/data/FewShotMiner.js';
import type { FailureClusterer } from '@cua-lark/core/src/data/FailureClusterer.js';

export interface RouteContext {
  config: ServerConfig;
  eventBus: EventBus;
  taskQueue: TaskQueue;
  traceStore: SqliteTraceStore;
  embeddingClient?: EmbeddingClient;
  fewShotMiner?: FewShotMiner;
  failureClusterer?: FailureClusterer;
}

export async function registerRoutes(server: FastifyInstance, ctx: RouteContext) {
  await server.register(async (server) => {
    await import('./tasks.js').then((m) => m.registerTaskRoutes(server, ctx));
    await import('./stream.js').then((m) => m.registerStreamRoutes(server, ctx));
    await import('./trace.js').then((m) => m.registerTraceRoutes(server, ctx));
    await import('./skills.js').then((m) => m.registerSkillRoutes(server, ctx));
    await import('./health.js').then((m) => m.registerHealthRoutes(server, ctx));
    await import('./benchmarks.js').then((m) => m.registerBenchmarkRoutes(server, ctx));
    await import('./tool-stats.js').then((m) => m.registerToolStatsRoutes(server, ctx));
    await import('./screenshots.js').then((m) => m.registerScreenshotRoutes(server, ctx));
    await import('./confirm.js').then((m) => m.registerConfirmRoutes(server, ctx));
    const { embeddingClient, fewShotMiner, failureClusterer } = ctx;
    if (embeddingClient && fewShotMiner && failureClusterer) {
      await import('./curation.js').then((m) =>
        m.registerSkillCurationRoutes(server, {
          embeddingClient,
          fewShotMiner,
          failureClusterer,
        })
      );
    }
  });
}
