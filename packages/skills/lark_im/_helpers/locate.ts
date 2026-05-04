import type { LarkOperator } from '@cua-lark/core';
import { fuzzyContains, SkillError } from '@cua-lark/core';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

type SearchResultRole = 'ListItem' | 'Pane' | 'Button' | 'Text' | string;
type SearchResultElement = {
  role: SearchResultRole;
  name: string;
  boundingRectangle: Box;
};

function locator(operator: LarkOperator) {
  if (!operator.find) {
    throw new SkillError('locator_failed', 'Hybrid locator is not available');
  }
  return operator.find;
}

function elementBox(element: { boundingRectangle: Box }): Box {
  return element.boundingRectangle;
}

function pickLeftmostVisible(elements: Array<{ name: string; boundingRectangle: Box }>): Box | null {
  const candidates = elements
    .filter((element) => element.boundingRectangle.width > 0 && element.boundingRectangle.height > 0)
    .sort((a, b) => {
      const ax = a.boundingRectangle.x;
      const bx = b.boundingRectangle.x;
      return ax === bx ? a.boundingRectangle.y - b.boundingRectangle.y : ax - bx;
    });

  return candidates[0] ? elementBox(candidates[0]) : null;
}

function below(box: Box, anchor: Box, gap = 16): boolean {
  return box.y > anchor.y + anchor.height + gap;
}

function searchResultPriority(role: SearchResultRole): number {
  switch (role) {
    case 'ListItem':
      return 0;
    case 'Pane':
      return 1;
    case 'Button':
      return 2;
    case 'Text':
      return 3;
    default:
      return 4;
  }
}

function searchResultClickBox(element: SearchResultElement): Box {
  const box = element.boundingRectangle;
  const xOffset = element.role === 'Text'
    ? Math.min(Math.max(box.width / 2, 8), 80)
    : Math.min(Math.max(box.width * 0.18, 40), 96);
  const yOffset = Math.min(Math.max(box.height / 2, 12), 32);

  return {
    x: Math.max(0, box.x + xOffset),
    y: Math.max(0, box.y + yOffset),
    width: 0,
    height: 0,
  };
}

export async function locateImInput(operator: LarkOperator): Promise<Box> {
  const result = await locator(operator).byIntent({
    uia: { role: 'Edit', name: /输入消息|消息/ },
    ocr: { text: /输入消息|消息/ },
    vlm: { prompt: 'Locate the message input box in the current Lark/Feishu chat.' },
  });
  if (!result) throw new SkillError('locator_failed', 'IM 输入框未找到');
  return result.box;
}

export async function locateSearchButton(operator: LarkOperator): Promise<Box> {
  const uiaButtons = await operator.findAll({ role: 'Button', name: /搜索/ });
  const globalButton = pickLeftmostVisible(uiaButtons);
  if (globalButton) {
    return globalButton;
  }

  const result = await locator(operator).byIntent({
    ocr: { text: '搜索' },
    vlm: { prompt: 'Locate the global search button in the left sidebar or top-left area of Lark/Feishu. Do not choose the in-chat search button in the conversation header.' },
  });
  if (!result) throw new SkillError('locator_failed', '全局搜索按钮未找到');
  return result.box;
}

export async function locateSearchInput(operator: LarkOperator): Promise<Box> {
  const uiaInputs = await operator.findAll({ role: 'Edit', name: /搜索/ });
  const globalInput = pickLeftmostVisible(uiaInputs);
  if (globalInput) {
    return globalInput;
  }

  const result = await locator(operator).byIntent({
    ocr: { text: '搜索' },
    vlm: { prompt: 'Locate the active global search input field in Lark/Feishu. Do not choose any search field inside the current conversation.' },
  });
  if (!result) throw new SkillError('locator_failed', '全局搜索输入框未找到');
  return result.box;
}

export async function locateSearchResult(
  operator: LarkOperator,
  namePattern: string,
  searchInput: Box,
): Promise<Box> {
  const roles = ['ListItem', 'Pane', 'Button', 'Text'] as const;
  const groups = await Promise.all(
    roles.map(async (role) => operator.findAll({ role, name: namePattern })),
  );

  const candidates = groups
    .flat()
    .filter(Boolean)
    .map((element) => element as SearchResultElement)
    .filter((element) => fuzzyContains(element.name, namePattern))
    .filter((element) => below(element.boundingRectangle, searchInput))
    .filter((element) => element.boundingRectangle.width > 0 && element.boundingRectangle.height > 0)
    .sort((a, b) => {
      const priority = searchResultPriority(a.role) - searchResultPriority(b.role);
      if (priority !== 0) return priority;
      return a.boundingRectangle.y - b.boundingRectangle.y;
    });

  if (candidates[0]) {
    return searchResultClickBox(candidates[0]);
  }

  const fallback = await locator(operator).byIntent({
    ocr: { text: namePattern, region: {
      x: searchInput.x,
      y: searchInput.y + searchInput.height + 16,
      width: Math.max(searchInput.width, 600),
      height: 600,
    } },
    vlm: {
      prompt: `Locate the first group/chat search result named "${namePattern}" below the global search input. Do not select the search input itself, message history, or unrelated contact results.`,
    },
  });
  if (!fallback) {
    throw new SkillError('locator_failed', '搜索结果未找到');
  }

  return {
    x: fallback.box.x + Math.min(Math.max(fallback.box.width / 2, 8), 80),
    y: fallback.box.y + Math.min(Math.max(fallback.box.height / 2, 12), 32),
    width: 0,
    height: 0,
  };
}

export async function locateSendButton(operator: LarkOperator): Promise<Box | null> {
  const result = await locator(operator).byIntent({
    uia: { role: 'Button', name: /发送/ },
    ocr: { text: '发送' },
  });
  return result?.box ?? null;
}

export function boxToStartBox(box: Box): string {
  const x1 = box.x;
  const y1 = box.y;
  const x2 = box.x + box.width;
  const y2 = box.y + box.height;
  return `[${x1}, ${y1}, ${x2}, ${y2}]`;
}
