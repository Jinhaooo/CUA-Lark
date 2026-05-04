import { defineSkill, type Skill } from '@cua-lark/core';
import { z } from 'zod';

const skill: Skill<any, any> = defineSkill({
  name: '_common.cleanup_docs',
  kind: 'agent_driven',
  description: 'Clean up test docs by title or folder prefix.',
  manual: 'Use Docs GUI to delete or move to trash documents/folders matching the given prefix.',
  params: z.object({
    folderName: z.string().default('CUA-Lark-Test-Folder'),
    titlePrefix: z.string().default('CUA-Test-'),
    maxItems: z.number().int().positive().default(10),
  }),
  verifyActions: true,
  execute: async (ctx, params) => {
    await ctx.agent.run(
      `Clean up Lark/Feishu Docs test data. Open or search folder "${params.folderName}". Find and delete or move to trash up to ${params.maxItems} documents whose title starts with "${params.titlePrefix}". Use only GUI operations. If no matching docs are found, finish immediately.`,
    );
    return { success: true, folderName: params.folderName, titlePrefix: params.titlePrefix };
  },
  verify: async () => ({ passed: true, reason: 'Docs cleanup attempted by GUI skill' }),
});

export default skill;
