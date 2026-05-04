import type { LarkOperator } from '@cua-lark/core';
import type { Box } from './locate.js';

type UiaRole = 'Button' | 'Edit' | 'TabItem' | 'List' | 'ListItem' | 'Document' | 'Text' | 'Pane' | 'Window';

export async function waitForMessageContaining(
  operator: LarkOperator,
  text: string,
  timeoutMs: number,
): Promise<boolean> {
  const startTime = Date.now();
  const interval = 500;

  while (Date.now() - startTime < timeoutMs) {
    const ocrResult = await operator.find?.byOcr(text);
    
    if (ocrResult) {
      return true;
    }
    
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  return false;
}

export async function waitForElement(
  operator: LarkOperator,
  spec: { uia?: { role: UiaRole; name: string | RegExp }; ocr?: { text: string | RegExp } },
  timeoutMs: number,
): Promise<Box | null> {
  const startTime = Date.now();
  const interval = 300;

  while (Date.now() - startTime < timeoutMs) {
    const result = await operator.find?.byIntent(spec);
    if (result) {
      return result.box;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  return null;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
