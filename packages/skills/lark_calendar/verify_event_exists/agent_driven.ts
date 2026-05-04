import { defineSkill, type Skill, SkillError } from '@cua-lark/core';
import { z } from 'zod';

const skill: Skill<any, any> = defineSkill({
  name: 'lark_calendar.verify_event_exists',
  kind: 'agent_driven',
  description: 'Verify that a calendar event exists.',
  manual: 'Search or inspect the current calendar view for the event title.',
  params: z.object({
    title: z.string(),
  }),
  verifyActions: true,
  execute: async (ctx, params) => {
    await ctx.agent.run(
      `Verify that the Lark/Feishu calendar contains an event titled "${params.title}". Search or navigate the visible calendar if needed. Finish only when the title is visible. If it is not visible after reasonable attempts, use call_user().`,
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
