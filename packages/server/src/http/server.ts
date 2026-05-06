import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticFiles from '@fastify/static';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { ServerConfig } from '../config/ServerConfigLoader.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export function createServer(config: ServerConfig) {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      },
    },
  });

  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  fastify.register(cors, {
    origin: config.cors.allowedOrigins,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  });

  // Plan M6.3.4: serve built dashboard SPA at /dashboard/* in production.
  // Only register if the dist exists, otherwise dev path runs at :5174 via vite.
  const dashboardDistPath = path.join(moduleDir, '../../../dashboard/dist');
  if (existsSync(dashboardDistPath)) {
    fastify.register(staticFiles, {
      root: dashboardDistPath,
      prefix: '/dashboard/',
      wildcard: false,
    });
  }

  return fastify;
}