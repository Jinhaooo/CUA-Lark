import { defineSkill, fuzzyContains } from '@cua-lark/core';
import { z } from 'zod';
import {
  boxToStartBox,
  locateSearchButton,
  locateSearchInput,
  locateSearchResult,
  sleep,
} from '../_helpers/index.js';

export default defineSkill({
  name: 'lark_im.search_contact',
  kind: 'procedural',
  description: 'Search a contact or group and open the chat.',
  manual: 'Click global search, type the keyword, then click the matching chat result.',
  fallback: 'lark_im.search_contact_agent_driven',
  params: z.object({ name_pattern: z.string() }),
  verifyActions: false,
  sideEffects: undefined,
  async execute(ctx, params) {
    const searchButton = await locateSearchButton(ctx.operator);

    await ctx.operator.execute({
      action_type: 'click',
      action_inputs: {
        start_box: boxToStartBox(searchButton),
      },
    });

    await sleep(200);

    const searchInput = await locateSearchInput(ctx.operator);

    await ctx.operator.execute({
      action_type: 'click',
      action_inputs: {
        start_box: boxToStartBox(searchInput),
      },
    });

    await ctx.operator.execute({
      action_type: 'hotkey',
      action_inputs: { key: 'ctrl a' },
    });

    await ctx.operator.execute({
      action_type: 'type',
      action_inputs: { content: params.name_pattern },
    });

    await sleep(500);

    const resultElement = await locateSearchResult(ctx.operator, params.name_pattern, searchInput);
    await ctx.operator.execute({
      action_type: 'click',
      action_inputs: {
        start_box: boxToStartBox(resultElement),
      },
    });

    return { success: true, name_pattern: params.name_pattern };
  },
  async verify(ctx, params) {
    if (ctx.verifier) {
      return ctx.verifier.run({
        kind: 'staged',
        stages: [
          {
            name: 'fast',
            spec: { kind: 'a11y', role: 'Text', name: params.name_pattern },
            maxDurationMs: 300,
          },
          {
            name: 'medium',
            spec: { kind: 'ocr', contains: params.name_pattern },
            maxDurationMs: 1200,
          },
          {
            name: 'expensive',
            spec: { kind: 'vlm', prompt: `Verify that the active Lark chat title or conversation view matches "${params.name_pattern}". Return JSON {"passed":boolean,"reason":string}.` },
            maxDurationMs: 8000,
          },
        ],
      } as any, ctx);
    }

    const roles = ['Text', 'Button', 'ListItem', 'Pane', 'Window'] as const;
    const groups = await Promise.all(roles.map((role) => ctx.operator.findAll({ role })));
    const found = groups.flat().some((element) => fuzzyContains(element.name, params.name_pattern));
    return {
      passed: found,
      reason: found ? 'Target chat text is visible' : `Target chat text not visible: ${params.name_pattern}`,
    };
  },
});
