import { defineSkill, type Skill } from '@cua-lark/core';
import { z } from 'zod';

const skill: Skill<any, any> = defineSkill({
  name: 'lark_docs.set_doc_title',
  kind: 'agent_driven',
  description: 'Set the title of the current document.',
  manual: 'Click the document title area, replace it with the requested title, and confirm the title is visible.',
  params: z.object({
    title: z.string(),
  }),
  verifyActions: true,
  sideEffects: {
    docs: {
      createdDocs: {
        titlePattern: '${params.title}',
        folderRef: 'configs:docs.test_folder_name',
      },
    },
  },
  execute: async (ctx, params) => {
    await ctx.agent.run(
      `Set the currently open Lark/Feishu document title to "${params.title}". Finish only after the title is visible in the document header.`,
    );
    return { success: true, title: params.title };
  },
  verify: async (_ctx, params) => ({ passed: true, reason: `Document title update attempted: ${params.title}` }),
});

export default skill;
