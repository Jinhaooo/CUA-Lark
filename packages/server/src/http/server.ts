import Fastify from 'fastify';
import cors from '@fastify/cors';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { ServerConfig } from '../config/ServerConfigLoader.js';

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

  return fastify;
}