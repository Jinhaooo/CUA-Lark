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
    let a11y: 'enabled' | 'disabled' = 'disabled';
    try {
      if (ctx.uia) {
        const probe = await ctx.uia.isA11yEnabled();
        a11y = probe.enabled ? 'enabled' : 'disabled';
      }
    } catch {
      a11y = 'disabled';
    }
    const ocr = ctx.ocr ? 'available' : 'unavailable';
    const vlm = ctx.modelClient ? 'available' : 'unavailable';
    const status = (a11y === 'enabled' || ocr === 'available') && vlm === 'available' ? 'ok' : 'degraded';
    return { status, a11y, ocr, vlm } as const;
  });
}