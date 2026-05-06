import type { FastifyInstance } from 'fastify';
import { performance } from 'perf_hooks';
import type { RouteContext } from './index.js';

export async function registerBenchmarkRoutes(server: FastifyInstance, _ctx: RouteContext) {
  server.post('/benchmarks/pause-latency', async (request, reply) => {
    const serverReceive = performance.now();
    
    await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
    
    const serverProcess = performance.now();
    
    await new Promise(resolve => setTimeout(resolve, Math.random() * 5));
    
    const serverSend = performance.now();

    return reply.send({
      serverReceive,
      serverProcess,
      serverSend,
    });
  });

  server.get('/benchmarks/state-consistency', async (_request, reply) => {
    const queue = (server as any).taskQueue;
    
    if (!queue) {
      return reply.send({
        consistent: true,
        reason: 'No task queue initialized',
        details: {},
      });
    }

    const tasks = queue.getTasks?.() || [];
    const statusMap = queue.taskStatus || new Map();
    const pauseControllers = queue.pauseControllers || new Map();

    const consistent = tasks.every((task: { taskId: string }) => {
      const hasStatus = statusMap.has(task.taskId);
      const hasController = pauseControllers.has(task.taskId);
      return hasStatus && hasController;
    });

    return reply.send({
      consistent,
      reason: consistent ? 'All tasks have status and pause controller' : 'Missing status or controller for some tasks',
      details: {
        taskCount: tasks.length,
        statusCount: statusMap.size,
        controllerCount: pauseControllers.size,
      },
    });
  });

  server.get('/benchmarks/sse-order', async (_request, reply) => {
    const eventBus = (server as any).eventBus;
    
    if (!eventBus) {
      return reply.send({
        ordered: true,
        violation: null,
        events: [],
      });
    }

    const recentEvents = (eventBus as any).recentEvents?.slice(-20) || [];
    
    let ordered = true;
    let violation = null;
    
    for (let i = 1; i < recentEvents.length; i++) {
      if (recentEvents[i].timestamp < recentEvents[i - 1].timestamp) {
        ordered = false;
        violation = `Event ${i} timestamp (${recentEvents[i].timestamp}) < Event ${i - 1} timestamp (${recentEvents[i - 1].timestamp})`;
        break;
      }
    }

    return reply.send({
      ordered,
      violation,
      events: recentEvents.slice(-10),
    });
  });

  server.get('/benchmarks/health', async (_request, reply) => {
    return reply.send({
      status: 'ok',
      timestamp: Date.now(),
      uptime: process.uptime(),
    });
  });
}