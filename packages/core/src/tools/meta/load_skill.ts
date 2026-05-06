import { z } from 'zod';
import type { Tool } from '../types.js';

/**
 * load_skill — let the agent pull a skill's SKILL.md body into its own
 * system prompt at runtime. The base prompt lists all registered skills with
 * a one-line description; when the agent decides one is relevant (e.g. it
 * judges the task is IM-domain → load_skill('lark_im')), it calls this tool
 * and HarnessLoop appends the skill body to messages[0] for subsequent
 * iterations.
 *
 * No-op (idempotent) if the skill was already loaded earlier in this task.
 */
export const loadSkillTool: Tool<{ name: string }> = {
  name: 'load_skill',
  description:
    'Load a skill\'s full guidance into your system prompt for the rest of this task. Use when the listed name+description in the available-skills catalog matches the task you\'re solving (e.g. an IM task → load_skill({"name":"lark_im"})). Idempotent.',
  argsSchema: z.object({
    name: z.string().min(1),
  }),
  async execute(ctx, args) {
    const catalog = ctx.skillCatalog;
    if (!catalog) {
      return {
        success: false,
        observation: 'load_skill unavailable: skillCatalog not wired into harness context.',
        error: { kind: 'precondition_unmet', message: 'skillCatalog missing' },
      };
    }

    if (!ctx.loadedSkillBodies) {
      ctx.loadedSkillBodies = new Map<string, string>();
    }

    if (ctx.loadedSkillBodies.has(args.name)) {
      return {
        success: true,
        observation: `Skill '${args.name}' was already loaded earlier in this task. No re-load needed.`,
      };
    }

    const body = catalog.getBody(args.name);
    if (!body || !body.trim()) {
      const available = catalog.list().map((s) => s.name).join(', ');
      return {
        success: false,
        observation: `No skill named '${args.name}'. Available skills: ${available}`,
        error: { kind: 'not_found', message: `skill '${args.name}' not found` },
      };
    }

    ctx.loadedSkillBodies.set(args.name, body.trim());

    return {
      success: true,
      observation: `Loaded skill '${args.name}'. Its full guidance is now part of your system prompt for the rest of this task — re-read the system prompt before deciding the next action.`,
    };
  },
  category: 'meta',
  costHint: 'free',
};
