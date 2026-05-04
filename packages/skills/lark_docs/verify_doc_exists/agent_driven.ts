import { defineSkill, type Skill, SkillError } from '@cua-lark/core';
import { z } from 'zod';

const skill: Skill<any, any> = defineSkill({
  name: 'lark_docs.verify_doc_exists',
  kind: 'agent_driven',
  description: 'Verify that a document exists.',
  manual: 'Search or inspect Docs for the document title.',
  params: z.object({
    title: z.string(),
  }),
  verifyActions: true,
  execute: async (ctx, params) => {
    await ctx.agent.run(
      `Verify that a Lark/Feishu document titled "${params.title}" exists. Search the visible Docs list or current editor if needed. Finish only when the title is visible.`,
    );
    return { success: true, title: params.title };
  },
  verify: async (ctx, params) => {
    const result = await ctx.verifier!.run({
      kind: 'any',
      of: [
        { kind: 'a11y', role: 'Text', name: params.title },
        { kind: 'ocr', contains: params.title },
      ],
    }, ctx);
    if (!result.passed) {
      throw new SkillError('verify_failed', result.reason);
    }
    return result;
  },
});

export default skill;
