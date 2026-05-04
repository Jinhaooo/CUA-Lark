import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { RouteContext } from './index.js';

const statSchema = z.object({
  name: z.string(),
  callCount: z.number().int().nonnegative(),
  avgDurationMs: z.number().nonnegative(),
  successRate: z.number().min(0).max(1),
});

export async function registerToolStatsRoutes(server: FastifyInstance, ctx: RouteContext) {
  server.get('/tools/stats', {
    schema: {
      response: {
        200: z.object({
          stats: z.array(statSchema),
        }),
      },
    },
  }, async () => {
    const events = await ctx.traceStore.getEventsByKinds(['tool_call', 'tool_result']);

    type Bucket = { calls: number; durations: number[]; successes: number };
    const byTool = new Map<string, Bucket>();

    const callsByCorrelation = new Map<string, { name: string; iteration: number | undefined }>();

    for (const event of events) {
      const kind = event.kind as string;
      if (kind === 'tool_call') {
        const name = String(event.payload?.name ?? 'unknown');
        const iteration = event.payload?.iteration as number | undefined;
        const key = correlationKey(event.test_run_id, iteration);
        callsByCorrelation.set(key, { name, iteration });

        const bucket = byTool.get(name) ?? { calls: 0, durations: [], successes: 0 };
        bucket.calls += 1;
        byTool.set(name, bucket);
      } else if (kind === 'tool_result') {
        const iteration = event.payload?.iteration as number | undefined;
        const key = correlationKey(event.test_run_id, iteration);
        const matched = callsByCorrelation.get(key);
        if (!matched) continue;

        const bucket = byTool.get(matched.name);
        if (!bucket) continue;

        const durationMs = Number(event.payload?.durationMs ?? 0);
        const success = Boolean(event.payload?.success ?? false);
        bucket.durations.push(durationMs);
        if (success) bucket.successes += 1;
        callsByCorrelation.delete(key);
      }
    }

    const stats: z.infer<typeof statSchema>[] = [];
    for (const [name, bucket] of byTool.entries()) {
      const avgDurationMs = bucket.durations.length > 0
        ? bucket.durations.reduce((a, b) => a + b, 0) / bucket.durations.length
        : 0;
      const successRate = bucket.calls > 0 ? bucket.successes / bucket.calls : 0;
      stats.push({
        name,
        callCount: bucket.calls,
        avgDurationMs: Math.round(avgDurationMs),
        successRate: Math.round(successRate * 100) / 100,
      });
    }

    stats.sort((a, b) => b.callCount - a.callCount);

    return { stats };
  });
}

function correlationKey(taskId: string, iteration: number | undefined): string {
  return `${taskId}:${iteration ?? 'na'}`;
}
