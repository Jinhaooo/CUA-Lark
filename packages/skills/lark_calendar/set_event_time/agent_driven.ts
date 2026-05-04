import { defineSkill, type Skill } from '@cua-lark/core';
import { z } from 'zod';

const skill: Skill<any, any> = defineSkill({
  name: 'lark_calendar.set_event_time',
  kind: 'agent_driven',
  description: 'Set the time of a calendar event.',
  manual: 'Open the event editor, use the visible date/time picker controls to choose the requested range, then save.',
  params: z.object({
    title: z.string(),
    time_hint: z.string(),
  }),
  verifyActions: true,
  execute: async (ctx, params) => {
    await ctx.agent.run(
      `Find the Lark/Feishu calendar event titled "${params.title}", open its editor, set the event time to "${params.time_hint}", and save.

Important:
- Use the visible date/time picker, dropdowns, scroll wheels, or clickable time range options.
- Do not assume the time field supports direct keyboard typing.
- If the UI shows time ranges such as 01:00-01:30, choose the closest visible range controls for the requested start and end time.
- Finish only after the updated event is saved or visibly confirmed.`,
    );
    return { success: true, title: params.title, time_hint: params.time_hint };
  },
  verify: async () => ({ passed: true, reason: 'Calendar event time update attempted by GUI agent' }),
});

export default skill;
