import { defineSkill, fuzzyContains } from '@cua-lark/core';
import { z } from 'zod';
import { extractLastMessage } from '../_helpers/index.js';

export default defineSkill({
  name: 'lark_im.verify_message_sent',
  kind: 'procedural',
  description: 'Verify that a message was sent successfully.',
  manual: 'Check the latest message in the current chat.',
  fallback: 'lark_im.verify_message_sent_agent_driven',
  params: z.object({ text: z.string() }),
  verifyActions: false,
  sideEffects: undefined,
  async execute(ctx, params) {
    const roles = ['Text', 'Button', 'ListItem', 'Pane'] as const;
    const textElements = (await Promise.all(roles.map((role) => ctx.operator.findAll({ role })))).flat();
    const matched = textElements.find((element) => fuzzyContains(element.name, params.text));
    if (matched) {
      return { success: true, last_message_text: matched.name, has_failure_indicator: false };
    }

    const lastMessage = await extractLastMessage(ctx.operator);
    return {
      success: !lastMessage.hasFailureIndicator && fuzzyContains(lastMessage.text, params.text),
      last_message_text: lastMessage.text,
      has_failure_indicator: lastMessage.hasFailureIndicator,
    };
  },
  async verify(ctx, params) {
    if (ctx.verifier) {
      return ctx.verifier.run({
        kind: 'staged',
        stages: [
          {
            name: 'fast',
            spec: { kind: 'ocr', contains: params.text },
            maxDurationMs: 1200,
          },
          {
            name: 'expensive',
            spec: { kind: 'vlm', prompt: `Verify that the latest visible message in the current Lark chat matches "${params.text}" and has no failed-send or retry indicator. Return JSON {"passed":boolean,"reason":string}.` },
            maxDurationMs: 8000,
          },
        ],
      } as any, ctx);
    }

    const roles = ['Text', 'Button', 'ListItem', 'Pane'] as const;
    const textElements = (await Promise.all(roles.map((role) => ctx.operator.findAll({ role })))).flat();
    const found = textElements.some((element) => fuzzyContains(element.name, params.text));
    return {
      passed: found,
      reason: found ? 'Sent message is visible' : `Sent message is not visible: ${params.text}`,
    };
  },
});
