import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { RouteContext } from './index.js';
import type { PauseReason } from '../../../core/src/trace/EventBus.js';

export async function registerPauseRoutes(server: FastifyInstance, ctx: RouteContext) {
  const { taskQueue, eventBus } = ctx;

  server.post('/tasks/:id/pause', {
    schema: {
      params: z.object({
        id: z.string(),
      }),
      body: z.object({
        reason: z.enum(['user_hotkey', 'user_button', 'user_dashboard']).optional(),
      }),
      response: {
        200: z.object({
          paused: z.boolean(),
          pausedAt: z.number(),
          alreadyPaused: z.boolean(),
          pausedAtIteration: z.number(),
        }),
        404: z.object({
          error: z.string(),
        }),
        409: z.object({
          error: z.string(),
          state: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled', 'paused']),
        }),
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason } = request.body as { reason?: PauseReason };

    const task = taskQueue.getTask(id);
    if (!task) {
      return reply.status(404).send({ error: 'task_not_found' });
    }

    if (task.status !== 'running') {
      return reply.status(409).send({ error: 'task_not_running', state: task.status });
    }

    const pauseResult = taskQueue.pauseTask(id, reason || 'user_dashboard');
    
    if (pauseResult.paused) {
      eventBus.emit({
        kind: 'task_paused',
        taskId: id,
        pausedAtIteration: pauseResult.pausedAtIteration,
        reason: pauseResult.reason,
        pausedAt: Date.now(),
      });
    }

    return {
      paused: pauseResult.paused,
      pausedAt: Date.now(),
      alreadyPaused: pauseResult.alreadyPaused,
      pausedAtIteration: pauseResult.pausedAtIteration,
    };
  });

  server.post('/tasks/:id/resume', {
    schema: {
      params: z.object({
        id: z.string(),
      }),
      response: {
        200: z.object({
          resumed: z.boolean(),
          resumedAt: z.number(),
          alreadyRunning: z.boolean(),
          resumedAtIteration: z.number(),
        }),
        404: z.object({
          error: z.string(),
        }),
        409: z.object({
          error: z.string(),
          state: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled', 'paused']),
        }),
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const task = taskQueue.getTask(id);
    if (!task) {
      return reply.status(404).send({ error: 'task_not_found' });
    }

    const resumeResult = taskQueue.resumeTask(id);
    
    if (resumeResult.resumed) {
      eventBus.emit({
        kind: 'task_resumed',
        taskId: id,
        resumedAt: Date.now(),
        resumedAtIteration: resumeResult.resumedAtIteration,
      });
    }

    return {
      resumed: resumeResult.resumed,
      resumedAt: Date.now(),
      alreadyRunning: resumeResult.alreadyRunning,
      resumedAtIteration: resumeResult.resumedAtIteration,
    };
  });

  server.post('/tasks/:id/skip-step', {
    schema: {
      params: z.object({
        id: z.string(),
      }),
      response: {
        200: z.object({
          skipped: z.boolean(),
          currentIteration: z.number(),
        }),
        404: z.object({
          error: z.string(),
        }),
        409: z.object({
          error: z.string(),
          state: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled', 'paused']),
        }),
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const task = taskQueue.getTask(id);
    if (!task) {
      return reply.status(404).send({ error: 'task_not_found' });
    }

    if (task.status !== 'running' && task.status !== 'paused') {
      return reply.status(409).send({ error: 'task_not_running_or_paused', state: task.status });
    }

    const skipResult = taskQueue.skipTaskStep(id);
    
    return {
      skipped: skipResult.skipped,
      currentIteration: skipResult.currentIteration,
    };
  });
}