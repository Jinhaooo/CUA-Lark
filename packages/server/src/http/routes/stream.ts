import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { RouteContext } from './index.js';
import { createSseBroker } from '../../sse/SseBroker.js';

export async function registerStreamRoutes(server: FastifyInstance, ctx: RouteContext) {
  const sseBroker = createSseBroker(ctx.eventBus);

  server.get('/tasks/:id/stream', {
    schema: {
      params: z.object({
        id: z.string(),
      }),
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const task = await ctx.traceStore.getTask(id);
    if (!task) {
      return reply.status(404).send({ error: 'NotFound', message: 'Task not found' });
    }

    sseBroker.attach(id, reply);
  });

  // Global event firehose. Frontend Electron main process subscribes here so
  // it can forward events for *all* in-flight tasks into the renderer without
  // having to attach to each task individually. Per-task /tasks/:id/stream
  // remains the API for the dashboard's task-detail view.
  server.get('/stream', async (_req, reply) => {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');
    reply.hijack();

    const heartbeat = setInterval(() => {
      try { reply.raw.write('event: ping\ndata: {}\n\n'); } catch {}
    }, 15000);

    const unsubscribe = ctx.eventBus.subscribeAll((event) => {
      try {
        reply.raw.write(`event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);
      } catch {}
    });

    reply.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}