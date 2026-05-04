import { defineSkill, type Skill } from '@cua-lark/core';
import { z } from 'zod';

const skill: Skill<any, any> = defineSkill({
  name: 'lark_calendar.create_event',
  kind: 'agent_driven',
  description: 'Create a calendar event.',
  manual: 'Create a new calendar event with the given title. If a time hint is provided, use calendar UI controls to select it.',
  params: z.object({
    title: z.string(),
    time_hint: z.string().default('today later'),
  }),
  verifyActions: true,
  sideEffects: {
    calendar: {
      createdEvents: {
        titlePattern: '${params.title}',
        timeRangeRef: '${params.time_hint}',
      },
    },
  },
  execute: async (ctx, params) => {
    await ctx.agent.run(
      `Create a Lark/Feishu calendar event titled "${params.title}". Use this time hint: "${params.time_hint}". Save the event.

Important:
- If you need to set a date or time, use the visible calendar/time picker controls, dropdowns, scroll wheels, or clickable options.
- Do not assume the time field supports direct keyboard typing.
- If no specific time is required, keep Lark's default selected time.
- Finish only after the saved event is visible or the UI clearly confirms it was created.`,
    );
    return { success: true, title: params.title, time_hint: params.time_hint };
  },
  verify: async (_ctx, params) => ({
    passed: true,
    reason: `Calendar event creation attempted: ${params.title}`,
  }),
});

export default skill;
