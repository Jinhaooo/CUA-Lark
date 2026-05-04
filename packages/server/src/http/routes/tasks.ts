import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { RouteContext } from './index.js';
import type { TaskStatus } from '@cua-lark/core/src/trace/SqliteTraceStore.js';

const taskStatuses = ['queued', 'running', 'completed', 'failed', 'cancelled'] as const;

function isTaskStatus(status: string | undefined): status is TaskStatus {
  return taskStatuses.includes(status as TaskStatus);
}

export async function registerTaskRoutes(server: FastifyInstance, ctx: RouteContext) {
  server.post('/tasks', {
    schema: {
      body: z.object({
        instruction: z.string().min(1).max(4096),
        params: z.record(z.string(), z.unknown()).optional(),
      }),
      response: {
        200: z.object({
          taskId: z.string(),
          status: z.literal('queued'),
        }),
        429: z.object({
          error: z.literal('QueueFull'),
          message: z.string(),
        }),
      },
    },
  }, async (req, reply) => {
    const { instruction, params } = req.body as { instruction: string; params?: Record<string, unknown> };
    
    try {
      const { taskId } = await ctx.taskQueue.enqueue({ instruction, params });
      return { taskId, status: 'queued' };
    } catch (error) {
      if (error instanceof Error && error.message.includes('QueueFull')) {
        return reply.status(429).send({ error: 'QueueFull', message: 'Task queue is full' });
      }
      throw error;
    }
  });

  server.get('/tasks', {
    schema: {
      querystring: z.object({
        status: z.enum(taskStatuses).optional(),
        limit: z.coerce.number().int().positive().max(100).optional().default(20),
        offset: z.coerce.number().int().nonnegative().optional().default(0),
      }),
      response: {
        200: z.object({
          tasks: z.array(z.object({
            id: z.string(),
            instruction: z.string(),
            status: z.enum(taskStatuses),
            enqueuedAt: z.number(),
            startedAt: z.number().optional(),
            finishedAt: z.number().optional(),
            totalTokens: z.number().optional(),
            finishedReason: z.string().optional(),
            routedSkill: z.string().optional(),
          })),
          total: z.number(),
        }),
      },
    },
  }, async (req) => {
    const { status, limit, offset } = req.query as { status?: string; limit?: number; offset?: number };
    const result = await ctx.traceStore.listTasks({ status: isTaskStatus(status) ? status : undefined, limit, offset });
    return result;
  });

  server.get('/tasks/:id', {
    schema: {
      params: z.object({
        id: z.string(),
      }),
      response: {
        200: z.object({
          id: z.string(),
          instruction: z.string(),
          params: z.record(z.string(), z.unknown()),
          status: z.enum(taskStatuses),
          enqueuedAt: z.number(),
          startedAt: z.number().optional(),
          finishedAt: z.number().optional(),
          totalTokens: z.number().optional(),
          finishedReason: z.string().optional(),
          routedSkill: z.string().optional(),
        }),
        404: z.object({
          error: z.literal('NotFound'),
          message: z.string(),
        }),
      },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const task = await ctx.traceStore.getTask(id);
    
    if (!task) {
      return reply.status(404).send({ error: 'NotFound', message: 'Task not found' });
    }
    
    return task;
  });

  server.delete('/tasks/:id', {
    schema: {
      params: z.object({
        id: z.string(),
      }),
      response: {
        204: z.void(),
        404: z.object({
          error: z.literal('NotFound'),
          message: z.string(),
        }),
      },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const cancelled = await ctx.taskQueue.cancel(id);
    
    if (!cancelled) {
      return reply.status(404).send({ error: 'NotFound', message: 'Task not found or already completed' });
    }
    
    return reply.status(204).send();
  });
}
