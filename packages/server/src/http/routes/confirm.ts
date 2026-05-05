import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { RouteContext } from './index.js';
import { RiskConfirmationRegistry } from '@cua-lark/core/src/tools/meta/ASK_USER.js';

export async function registerConfirmRoutes(server: FastifyInstance, ctx: RouteContext) {
  server.post('/tasks/:id/confirm', {
    schema: {
      params: z.object({
        id: z.string(),
      }),
      body: z.object({
        confirmed: z.boolean(),
        reason: z.string().optional(),
      }),
      response: {
        200: z.object({
          received: z.boolean(),
        }),
        404: z.object({
          error: z.string(),
          message: z.string(),
        }),
      },
    },
  }, async (req, reply) => {
    const { id: taskId } = req.params as { id: string };
    const { confirmed, reason } = req.body as { confirmed: boolean; reason?: string };

    const registry = RiskConfirmationRegistry.getInstance();

    if (!registry.hasPending(taskId)) {
      return reply.status(404).send({
        error: 'NotFound',
        message: `No pending confirmation for task ${taskId}`,
      });
    }

    registry.resolve(taskId, {
      confirmed,
      reason,
      source: 'user',
    });

    return { received: true };
  });
}
