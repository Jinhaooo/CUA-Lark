import { defineSkill, type Skill } from '@cua-lark/core';
import { z } from 'zod';

const skill: Skill<any, any> = defineSkill({
  name: '_common.cleanup_im_messages',
  kind: 'agent_driven',
  description: 'Recall recent test IM messages.',
  manual: 'Use the IM GUI to recall/delete recent messages matching a test prefix in a target chat.',
  params: z.object({
    chatPattern: z.string().default('CUA-Lark-Test'),
    contentPattern: z.string().default('CUA-Test-'),
    withinHours: z.number().positive().default(4),
    maxItems: z.number().int().positive().default(10),
  }),
  verifyActions: true,
  execute: async (ctx, params) => {
    await ctx.agent.run(
      `Clean up Lark/Feishu IM test messages. Open chat "${params.chatPattern}" if needed. Recall or delete up to ${params.maxItems} messages sent by the current user/bot within the last ${params.withinHours} hours whose content matches "${params.contentPattern}". Use only GUI operations. If no matching messages are found or recall is unavailable, finish without changing unrelated messages.`,
    );
    return { success: true, chatPattern: params.chatPattern, contentPattern: params.contentPattern };
  },
  verify: async () => ({ passed: true, reason: 'IM cleanup attempted by GUI skill' }),
});

export default skill;
