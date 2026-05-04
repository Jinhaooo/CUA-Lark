import { defineSkill, fuzzyContains, SkillError } from '@cua-lark/core';
import { z } from 'zod';
import { boxToStartBox, sleep, type Box } from '../_helpers/index.js';

const RECALL_TEXT = '\u64a4\u56de';
const RECALL_NOTICE = '\u4f60\u64a4\u56de\u4e86\u4e00\u6761\u6d88\u606f';
const RECALL_NOTICE_SHORT = '\u64a4\u56de\u4e86\u4e00\u6761\u6d88\u606f';
const CONFIRM_TEXT = /\u786e\u5b9a|\u786e\u8ba4|\u64a4\u56de/;

type ElementLike = {
  role: string;
  name: string;
  boundingRectangle: Box;
};

type RecallResult = {
  success: true;
  text: string;
  targetBox: Box;
  recallNoticeCountBefore: number;
};

export default defineSkill<{ text: string }, RecallResult>({
  name: 'lark_im.recall_last_message',
  kind: 'procedural',
  description: 'Recall the latest outgoing message matching exact text in the current chat.',
  manual: 'Right-click the latest matching outgoing message, click the Recall menu item, and verify by differential UI state.',
  params: z.object({ text: z.string() }),
  verifyActions: false,
  sideEffects: undefined,
  async execute(ctx, params): Promise<RecallResult> {
    const beforeElements = await readVisibleElements(ctx.operator);
    const target = await locateLatestOutgoingMessage(ctx.operator, params.text, beforeElements);
    const recallNoticeCountBefore = countRecallNotices(beforeElements);

    await ctx.operator.execute({
      action_type: 'right_single',
      action_inputs: {
        start_box: pointStartBox(centerOf(target.boundingRectangle)),
      },
    });

    await sleep(300);

    const menuItem = await locateRecallMenuItem(ctx.operator, target.boundingRectangle);
    await ctx.operator.execute({
      action_type: 'click',
      action_inputs: {
        start_box: pointStartBox(menuItem),
      },
    });

    await sleep(500);
    await clickConfirmIfPresent(ctx.operator);
    await sleep(800);

    return {
      success: true,
      text: params.text,
      targetBox: target.boundingRectangle,
      recallNoticeCountBefore,
    };
  },
  async verify(ctx, params, result?: RecallResult) {
    if (!result?.targetBox) {
      return { passed: false, reason: 'Missing recall baseline state' };
    }

    const elements = await readVisibleElements(ctx.operator);
    const noticeCountAfter = countRecallNotices(elements);
    const targetStillAtSamePlace = elements.some((element) =>
      fuzzyContains(element.name, params.text) && boxesOverlap(element.boundingRectangle, result.targetBox, 0.45),
    );

    const recallNoticeNearTarget = elements.some((element) =>
      isRecallNoticeText(element.name) && isNearOriginalMessageSlot(element.boundingRectangle, result.targetBox),
    );

    if (noticeCountAfter > result.recallNoticeCountBefore) {
      return {
        passed: true,
        reason: 'Recall notice count increased after clicking Recall',
      };
    }

    if (recallNoticeNearTarget) {
      return {
        passed: true,
        reason: 'Recall notice is visible near the original target message position',
      };
    }

    if (!targetStillAtSamePlace && noticeCountAfter > 0) {
      return {
        passed: true,
        reason: 'Target message disappeared from its original position and a recall notice is visible',
      };
    }

    if (ctx.verifier) {
      const targetRegion = expandBox(result.targetBox, 80, 50);
      return ctx.verifier.run({
        kind: 'staged',
        stages: [
          {
            name: 'expensive',
            spec: {
              kind: 'vlm',
              prompt: `Verify that the specific message "${params.text}" at or near region ${JSON.stringify(targetRegion)} has been recalled. Pass only if the message bubble is gone from that location and the chat shows a new recall success notice. Do not pass based only on an old recall notice elsewhere in the chat. Return JSON {"passed":boolean,"reason":string}.`,
            },
            maxDurationMs: 8000,
          },
        ],
      } as any, ctx);
    }

    return {
      passed: false,
      reason: targetStillAtSamePlace
        ? 'Target message is still visible at its original position'
        : 'Recall notice count did not increase',
    };
  },
});

async function readVisibleElements(operator: any): Promise<ElementLike[]> {
  const roles = ['Text', 'Button', 'ListItem', 'Pane'] as const;
  const elements = (await Promise.all(roles.map((role) => operator.findAll({ role })))).flat() as ElementLike[];
  return elements.filter((element) => isVisibleBox(element.boundingRectangle) && element.name?.trim());
}

async function locateLatestOutgoingMessage(
  operator: any,
  text: string,
  elements: ElementLike[],
): Promise<ElementLike> {
  let candidates = elements
    .filter((element) => fuzzyContains(element.name, text))
    .filter((element) => element.boundingRectangle.width > 0 && element.boundingRectangle.height > 0);

  if (candidates.length === 0 && operator.find) {
    const found = await operator.find.byIntent({
      ocr: { text },
      vlm: {
        prompt: `Locate the latest outgoing message bubble whose visible text exactly equals "${text}" in the current Lark/Feishu chat.`,
      },
    });
    if (found?.box) {
      return { role: 'Text', name: text, boundingRectangle: found.box };
    }
  }

  if (candidates.length === 0) {
    throw new SkillError('not_found', `Message text not visible: ${text}`);
  }

  const screenshot = await operator.screenshot();
  const screenMidX = screenshot.width / 2;
  const rightSideCandidates = candidates.filter((element) => centerOf(element.boundingRectangle).x >= screenMidX);
  candidates = rightSideCandidates.length > 0 ? rightSideCandidates : candidates;

  return candidates.sort((a, b) => {
    const ay = a.boundingRectangle.y + a.boundingRectangle.height;
    const by = b.boundingRectangle.y + b.boundingRectangle.height;
    if (ay !== by) return by - ay;
    return b.boundingRectangle.x - a.boundingRectangle.x;
  })[0]!;
}

async function locateRecallMenuItem(operator: any, targetBox: Box): Promise<{ x: number; y: number }> {
  const elements = await readVisibleElements(operator);
  const candidates = elements
    .filter((element) => element.name.trim() === RECALL_TEXT || fuzzyContains(element.name, RECALL_TEXT))
    .filter((element) => isLikelyContextMenuItem(element.boundingRectangle, targetBox))
    .sort((a, b) => distance(centerOf(a.boundingRectangle), centerOf(targetBox)) - distance(centerOf(b.boundingRectangle), centerOf(targetBox)));

  if (candidates[0]) {
    return recallMenuClickPoint(candidates[0].boundingRectangle);
  }

  if (operator.find) {
    const region = expandBox(targetBox, 380, 480);
    const found = await operator.find.byIntent({
      ocr: { text: RECALL_TEXT, region },
      vlm: {
        prompt: `Locate the visible context-menu item labeled "${RECALL_TEXT}" opened by right-clicking the target message. Do not locate the three-dot button, toolbar, Delete item, or blank space.`,
      },
    });
    if (found?.box && isLikelyContextMenuItem(found.box, targetBox)) {
      return recallMenuClickPoint(found.box);
    }
  }

  throw new SkillError('locator_failed', 'Recall menu item is not visible after right-clicking the target message');
}

function recallMenuClickPoint(labelBox: Box): { x: number; y: number } {
  const labelCenter = centerOf(labelBox);
  return {
    x: Math.max(0, labelCenter.x - 28),
    y: labelCenter.y,
  };
}

async function clickConfirmIfPresent(operator: any): Promise<void> {
  const elements = await readVisibleElements(operator);
  const confirm = elements
    .filter((element) => element.role === 'Button' && CONFIRM_TEXT.test(element.name))
    .filter((element) => isVisibleBox(element.boundingRectangle))
    .sort((a, b) => b.boundingRectangle.x - a.boundingRectangle.x)[0];

  if (!confirm) {
    return;
  }

  await operator.execute({
    action_type: 'click',
    action_inputs: {
      start_box: boxToStartBox(confirm.boundingRectangle),
    },
  });
}

function countRecallNotices(elements: ElementLike[]): number {
  return elements.filter((element) => isRecallNoticeText(element.name)).length;
}

function isRecallNoticeText(name: string): boolean {
  return (
    fuzzyContains(name, RECALL_NOTICE) ||
    fuzzyContains(name, RECALL_NOTICE_SHORT) ||
    (fuzzyContains(name, RECALL_TEXT) && fuzzyContains(name, '\u6d88\u606f')) ||
    fuzzyContains(name, 'recalled a message') ||
    fuzzyContains(name, 'recalled this message')
  );
}

function isNearOriginalMessageSlot(noticeBox: Box, targetBox: Box): boolean {
  const noticeCenter = centerOf(noticeBox);
  const targetCenter = centerOf(targetBox);
  return Math.abs(noticeCenter.y - targetCenter.y) <= 180;
}

function isLikelyContextMenuItem(box: Box, targetBox: Box): boolean {
  const targetCenter = centerOf(targetBox);
  const itemCenter = centerOf(box);
  return (
    box.width > 8 &&
    box.height > 8 &&
    Math.abs(itemCenter.x - targetCenter.x) <= 420 &&
    Math.abs(itemCenter.y - targetCenter.y) <= 520
  );
}

function isVisibleBox(box: Box): boolean {
  return box.width > 0 && box.height > 0 && box.x >= 0 && box.y >= 0;
}

function centerOf(box: Box): { x: number; y: number } {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

function pointStartBox(point: { x: number; y: number }): string {
  return `[${point.x}, ${point.y}, ${point.x}, ${point.y}]`;
}

function expandBox(box: Box, xPadding: number, yPadding: number): Box {
  return {
    x: Math.max(0, box.x - xPadding),
    y: Math.max(0, box.y - yPadding),
    width: box.width + xPadding * 2,
    height: box.height + yPadding * 2,
  };
}

function boxesOverlap(a: Box, b: Box, minRatio: number): boolean {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const overlap = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const smaller = Math.max(1, Math.min(a.width * a.height, b.width * b.height));
  return overlap / smaller >= minRatio;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
