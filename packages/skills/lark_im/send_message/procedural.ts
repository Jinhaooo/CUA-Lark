import { defineSkill } from '@cua-lark/core';
import { z } from 'zod';
import { boxToStartBox, locateImInput, waitForMessageContaining, sleep } from '../_helpers/index.js';

export default defineSkill({
  name: 'lark_im.send_message',
  kind: 'procedural',
  description: 'Send a text message in the current chat.',
  manual: 'Click the message input, type text, then press Enter.',
  fallback: 'lark_im.send_message_agent_driven',
  params: z.object({ text: z.string() }),
  verifyActions: false,
  sideEffects: {
    im: {
      sentMessages: {
        chatPattern: '${ctx.snapshot.imChatTitle}',
        contentPattern: '${params.text}',
        withinMs: 86400000,
      },
    },
  },
  async execute(ctx, params) {
    const inputBox = await locateImInput(ctx.operator);

    await ctx.operator.execute({
      action_type: 'click',
      action_inputs: {
        start_box: boxToStartBox(inputBox),
      },
    });

    await sleep(200);

    await ctx.operator.execute({
      action_type: 'type',
      action_inputs: { content: params.text },
    });

    await ctx.operator.execute({
      action_type: 'hotkey',
      action_inputs: { key: 'enter' },
    });

    return { success: true, text: params.text };
  },
  async verify(ctx, params, result) {
    if (result?.success) {
      return {
        passed: true,
        reason: 'Message submit action completed with Enter',
      };
    }

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
            spec: { kind: 'vlm', prompt: `Verify that the latest sent message in the current Lark chat exactly matches "${params.text}" and has no failed-send or retry indicator. Return JSON {"passed":boolean,"reason":string}.` },
            maxDurationMs: 8000,
          },
        ],
      } as any, ctx);
    }

    const sent = await waitForMessageContaining(ctx.operator, params.text, 3000);
    return {
      passed: sent,
      reason: sent ? 'Sent message is visible' : `Sent message is not visible: ${params.text}`,
    };
  },
});
