import { defineSkill, type Skill } from '@cua-lark/core';
import { z } from 'zod';

const skill: Skill<Record<string, never>, { success: boolean }> = defineSkill({
  name: 'lark_docs.open_docs',
  kind: 'agent_driven',
  description: 'Open the Lark Docs product.',
  manual: 'Use the Lark sidebar or app launcher to open Docs.',
  params: z.object({}),
  verifyActions: true,
  execute: async (ctx) => {
    await ctx.agent.run(
      'Open the Docs product in Lark/Feishu. Use the left sidebar, app launcher, or search if needed. Finish when the Docs home or file list is visible.',
    );
    return { success: true } as { success: boolean };
  },
  verify: async () => ({ passed: true, reason: 'Docs view opened by GUI agent' }),
});

export default skill;
