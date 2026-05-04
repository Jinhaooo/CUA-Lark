import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { RouteContext } from './index.js';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';

const BENCH_DIR = './bench-reports';

const reportSchema = z.object({
  milestone: z.string(),
  filename: z.string(),
  title: z.string(),
  rawMarkdown: z.string(),
});

export async function registerBenchmarkRoutes(server: FastifyInstance, _ctx: RouteContext) {
  server.get('/benchmarks', {
    schema: {
      response: {
        200: z.object({
          reports: z.array(reportSchema),
        }),
      },
    },
  }, async () => {
    const reports: z.infer<typeof reportSchema>[] = [];

    let files: string[] = [];
    try {
      files = (await readdir(BENCH_DIR)).filter((f) => f.endsWith('.md'));
    } catch {
      return { reports };
    }

    for (const filename of files.sort()) {
      try {
        const rawMarkdown = await readFile(join(BENCH_DIR, filename), 'utf-8');
        const milestone = inferMilestone(filename);
        const title = inferTitle(rawMarkdown, filename);
        reports.push({ milestone, filename, title, rawMarkdown });
      } catch {
      }
    }

    return { reports };
  });
}

function inferMilestone(filename: string): string {
  const match = filename.match(/^(m\d(?:\.\d)?[a-z]?)/i);
  return match ? match[1].toLowerCase() : 'unknown';
}

function inferTitle(markdown: string, fallback: string): string {
  const firstHeading = markdown.match(/^#\s+(.+)$/m);
  return firstHeading ? firstHeading[1].trim() : fallback;
}
