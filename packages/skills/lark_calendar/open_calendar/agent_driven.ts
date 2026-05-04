import { defineSkill, type Skill } from '@cua-lark/core';
import { z } from 'zod';

const skill: Skill<Record<string, never>, { success: boolean }> = defineSkill({
  name: 'lark_calendar.open_calendar',
  kind: 'agent_driven',
  description: 'Open the Lark Calendar view.',
  manual: 'Use the Lark sidebar or app switcher to open Calendar. Finish only when the calendar grid or schedule view is visible.',
  params: z.object({}),
  verifyActions: true,
  execute: async (ctx) => {
    await ctx.agent.run(
      'Open the Calendar product in Lark/Feishu. Use the left sidebar, app launcher, or search if needed. Finish when the calendar main view is visible with a calendar grid, dates, or schedule entries.',
    );
    return { success: true } as { success: boolean };
  },
  verify: async () => ({ passed: true, reason: 'Calendar view opened by GUI agent' }),
});

export default skill;
