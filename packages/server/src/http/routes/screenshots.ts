import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { RouteContext } from './index.js';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { join, normalize, resolve, sep } from 'path';

const TRACES_ROOT = resolve('./traces');

export async function registerScreenshotRoutes(server: FastifyInstance, _ctx: RouteContext) {
  server.get('/screenshots/:runId/:filename', {
    schema: {
      params: z.object({
        runId: z.string().regex(/^[A-Z0-9]{26}$/i, 'runId must be a ULID'),
        filename: z.string().regex(/^[A-Za-z0-9._-]+\.png$/, 'filename must be a .png'),
      }),
    },
  }, async (req, reply) => {
    const { runId, filename } = req.params as { runId: string; filename: string };

    const requested = resolve(join(TRACES_ROOT, runId, 'screenshots', filename));
    const expectedPrefix = resolve(TRACES_ROOT) + sep;
    if (!requested.startsWith(expectedPrefix)) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Path traversal blocked' });
    }

    try {
      const stats = await stat(requested);
      if (!stats.isFile()) {
        return reply.status(404).send({ error: 'NotFound', message: 'Screenshot not found' });
      }
    } catch {
      return reply.status(404).send({ error: 'NotFound', message: 'Screenshot not found' });
    }

    reply.header('Content-Type', 'image/png');
    reply.header('Cache-Control', 'public, max-age=86400, immutable');
    return reply.send(createReadStream(requested));
  });
}
