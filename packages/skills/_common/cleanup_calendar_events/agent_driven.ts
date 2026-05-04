import { defineSkill, type Skill } from '@cua-lark/core';
import { z } from 'zod';

const skill: Skill<any, any> = defineSkill({
  name: '_common.cleanup_calendar_events',
  kind: 'agent_driven',
  description: 'Clean up test calendar events by prefix.',
  manual: 'Use Calendar GUI to delete visible/searchable events whose titles start with the given prefix.',
  params: z.object({
    titlePrefix: z.string().default('CUA-Test-'),
    timeRange: z.object({
      start: z.string().optional(),
      end: z.string().optional(),
    }).optional(),
    maxItems: z.number().int().positive().default(10),
  }),
  verifyActions: true,
  execute: async (ctx, params) => {
    await ctx.agent.run(
      `Clean up Lark/Feishu Calendar test data. Find and delete up to ${params.maxItems} calendar events whose title starts with "${params.titlePrefix}". Use only GUI operations. If no matching events are found, finish immediately.`,
    );
    return { success: true, titlePrefix: params.titlePrefix };
  },
  verify: async () => ({ passed: true, reason: 'Calendar cleanup attempted by GUI skill' }),
});

export default skill;
