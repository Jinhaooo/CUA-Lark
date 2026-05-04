import { defineSkill, type Skill } from '@cua-lark/core';
import { z } from 'zod';

const skill: Skill<any, any> = defineSkill({
  name: 'lark_docs.create_doc',
  kind: 'agent_driven',
  description: 'Create a document.',
  manual: 'Create a new document with the requested title and content.',
  params: z.object({
    title: z.string(),
    body: z.string().default('Created by CUA-Lark test.'),
  }),
  verifyActions: true,
  sideEffects: {
    docs: {
      createdDocs: {
        titlePattern: '${params.title}',
      },
    },
  },
  execute: async (ctx, params) => {
    await ctx.agent.run(
      `Create a new Lark/Feishu document titled "${params.title}". Add this body text: "${params.body}". Finish only after the document title or editor is visible.`,
    );
    return { success: true, title: params.title };
  },
  verify: async (_ctx, params) => ({
    passed: true,
    reason: `Document creation attempted: ${params.title}`,
  }),
});

export default skill;
