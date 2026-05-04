import { defineSkill, type Skill } from '@cua-lark/core';
import { z } from 'zod';

const skill: Skill<any, any> = defineSkill({
  name: 'lark_docs.insert_text',
  kind: 'agent_driven',
  description: 'Insert text into the current document body.',
  manual: 'Focus the document body and insert the requested text.',
  params: z.object({
    text: z.string(),
  }),
  verifyActions: true,
  execute: async (ctx, params) => {
    await ctx.agent.run(
      `Insert this text into the body of the currently open Lark/Feishu document: "${params.text}". Finish only after the text is visibly present in the editor.`,
    );
    return { success: true, text: params.text };
  },
  verify: async (ctx, params) => {
    if (!ctx.verifier) {
      return { passed: true, reason: 'Document body insertion attempted' };
    }

    return ctx.verifier.run({
      kind: 'staged',
      stages: [
        { name: 'fast', spec: { kind: 'ocr', contains: params.text }, maxDurationMs: 1200 },
        {
          name: 'expensive',
          spec: { kind: 'vlm', prompt: `Verify that the current document body contains "${params.text}". Return JSON {"passed":boolean,"reason":string}.` },
          maxDurationMs: 8000,
        },
      ],
    } as any, ctx);
  },
});

export default skill;
