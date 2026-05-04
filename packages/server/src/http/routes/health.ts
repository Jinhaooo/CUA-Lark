import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { RouteContext } from './index.js';

export async function registerHealthRoutes(server: FastifyInstance, ctx: RouteContext) {
  server.get('/health', {
    schema: {
      response: {
        200: z.object({
          status: z.enum(['ok', 'degraded']),
          a11y: z.enum(['enabled', 'disabled']),
          ocr: z.enum(['available', 'unavailable']),
          vlm: z.enum(['available', 'unavailable']),
        }),
      },
    },
  }, async () => {
    return {
      status: 'ok' as const,
      a11y: 'enabled' as const,
      ocr: 'available' as const,
      vlm: 'available' as const,
    };
  });
}