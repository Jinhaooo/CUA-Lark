import { defineSkill, fuzzyContains, type Skill } from '@cua-lark/core';
import { z } from 'zod';

const RECALL_TEXT = '\u64a4\u56de';
const RECALL_NOTICE = '\u4f60\u64a4\u56de\u4e86\u4e00\u6761\u6d88\u606f';
const RECALL_NOTICE_SHORT = '\u64a4\u56de\u4e86\u4e00\u6761\u6d88\u606f';
const DELETE_TEXT = '\u5220\u9664';

const skill: Skill<any, any> = defineSkill({
  name: 'lark_im.recall_last_message',
  kind: 'agent_driven',
  description: 'Recall the latest outgoing message matching exact text in the current chat.',
  manual: 'Operate only on the latest outgoing message with the requested exact text. Recall one message and stop after the recall success notice is visible.',
  params: z.object({
    text: z.string(),
  }),
  verifyActions: true,
  execute: async (ctx, params) => {
    await ctx.agent.run(
      `In the currently open Lark/Feishu chat, recall only the latest outgoing message whose visible text exactly equals "${params.text}". Do not search the whole chat history. Do not process older messages.

Required steps:
1. Locate the latest outgoing message bubble whose visible text exactly equals "${params.text}".
2. Right-click that message bubble. When processing an existing message, right-clicking the target message is the preferred way to reveal the next available operations.
3. When the menu is open, visually confirm the Recall/${RECALL_TEXT} menu item is visible.
4. Move the pointer onto the Recall/${RECALL_TEXT} menu item itself and click it. Do not click nearby menu items or blank space.
5. Confirm any recall dialog if it appears.
6. Finish only after the chat shows a recall success notice, such as "${RECALL_NOTICE}", "You recalled a message", or an equivalent notice.

If no latest matching outgoing message is visible, finish without changing anything.

Important completion rule:
- Do not choose Delete/${DELETE_TEXT} for this task. The required operation is Recall/${RECALL_TEXT}.
- Do not click the three-dot/more-options toolbar button. Right-clicking the message should open the context menu directly.
- If the context menu opens and Recall/${RECALL_TEXT} is visible, your next action must be a click on the Recall/${RECALL_TEXT} menu item.
- After the recall success notice is visible, do not inspect repeatedly and do not retry older messages.
- End with exactly:
Thought: The latest matching message has been handled.
Action: finished()`,
    );
    return { success: true, text: params.text };
  },
  verify: async (ctx, params) => {
    const recallNoticePatterns = [
      RECALL_NOTICE,
      RECALL_NOTICE_SHORT,
      'recalled a message',
      'recalled this message',
    ];

    const roles = ['Text', 'Button', 'ListItem', 'Pane'] as const;
    const elements = (await Promise.all(roles.map((role) => ctx.operator.findAll({ role })))).flat();
    const matchedNotice = elements.find((element) =>
      recallNoticePatterns.some((pattern) => fuzzyContains(element.name, pattern)),
    );

    if (matchedNotice) {
      return { passed: true, reason: `Recall success notice visible: ${matchedNotice.name}` };
    }

    if (ctx.verifier) {
      return ctx.verifier.run({
        kind: 'staged',
        stages: [
          {
            name: 'medium',
            spec: { kind: 'ocr', contains: RECALL_NOTICE_SHORT },
            maxDurationMs: 1500,
          },
          {
            name: 'expensive',
            spec: {
              kind: 'vlm',
              prompt: `Verify that the current Lark/Feishu chat shows that the message "${params.text}" was recalled successfully. Passing evidence must be a visible recall success notice such as "${RECALL_NOTICE}" or "You recalled a message". Do not pass merely because a context menu was opened or a recall attempt was made. Return JSON {"passed":boolean,"reason":string}.`,
            },
            maxDurationMs: 8000,
          },
        ],
      } as any, ctx);
    }

    return {
      passed: false,
      reason: 'Recall success notice is not visible',
    };
  },
});

export default skill;
