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
}