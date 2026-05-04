import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { RouteContext } from './index.js';
import { SkillRegistry } from '@cua-lark/core/src/skill/SkillRegistry.js';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

interface SkillMetadata {
  name: string;
  description?: string;
  toolWhitelist?: string[];
  maxLoopIterations?: number;
  finishCriteria?: string;
  fewShots?: unknown[];
}

export async function registerSkillRoutes(server: FastifyInstance, ctx: RouteContext) {
  const skillRegistry = new SkillRegistry();
  const cwd = process.cwd();
  const projectRoot = existsSync(join(cwd, 'packages', 'skills')) ? cwd : dirname(dirname(cwd));
  const skillsDir = join(projectRoot, 'packages', 'skills');
  await skillRegistry.loadFromFs(skillsDir);

  server.get('/skills', {
    schema: {
      response: {
        200: z.array(z.object({
          name: z.string(),
          description: z.string(),
          toolWhitelistCount: z.number(),
          fewShotCount: z.number(),
        })),
      },
    },
  }, async () => {
    const skills = skillRegistry.list();
    return skills.map((skill) => {
      const metadata = skill as SkillMetadata;
      return {
      name: skill.name,
      description: skill.description || '',
        toolWhitelistCount: metadata.toolWhitelist?.length || 0,
        fewShotCount: metadata.fewShots?.length || 0,
      };
    });
  });

  server.get('/skills/:name', {
    schema: {
      params: z.object({
        name: z.string(),
      }),
      response: {
        200: z.object({
          name: z.string(),
          description: z.string(),
          toolWhitelist: z.array(z.string()).optional(),
          maxLoopIterations: z.number(),
          finishCriteria: z.string(),
          fewShotCount: z.number(),
        }),
        404: z.object({
          error: z.literal('NotFound'),
          message: z.string(),
        }),
      },
    },
  }, async (req, reply) => {
    const { name } = req.params as { name: string };
    const skill = skillRegistry.get(name);

    if (!skill) {
      return reply.status(404).send({ error: 'NotFound', message: 'Skill not found' });
    }

    const metadata = skill as SkillMetadata;
    return {
      name: skill.name,
      description: skill.description || '',
      toolWhitelist: metadata.toolWhitelist,
      maxLoopIterations: metadata.maxLoopIterations ?? 30,
      finishCriteria: metadata.finishCriteria ?? '',
      fewShotCount: metadata.fewShots?.length || 0,
    };
  });
}
