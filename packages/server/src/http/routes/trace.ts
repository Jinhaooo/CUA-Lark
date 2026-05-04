import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { RouteContext } from './index.js';

export async function registerTraceRoutes(server: FastifyInstance, ctx: RouteContext) {
  server.get('/tasks/:id/trace', {
    schema: {
      params: z.object({
        id: z.string(),
      }),
      querystring: z.object({
        since: z.string().optional(),
      }),
      response: {
        200: z.array(z.object({
          id: z.string(),
          test_run_id: z.string(),
          parent_id: z.string().optional(),
          kind: z.string(),
          name: z.string(),
          status: z.enum(['running', 'passed', 'failed']),
          started_at: z.number(),
          ended_at: z.number().optional(),
          payload: z.record(z.string(), z.unknown()).optional(),
        })),
        404: z.object({
          error: z.literal('NotFound'),
          message: z.string(),
        }),
      },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { since } = req.query as { since?: string };

    const task = await ctx.traceStore.getTask(id);
    if (!task) {
      return reply.status(404).send({ error: 'NotFound', message: 'Task not found' });
    }

    const trace = await ctx.traceStore.getTrace(id, since);
    return trace;
  });
}