import type { LarkOperator } from '@cua-lark/core';

export interface LastMessage {
  text: string;
  hasFailureIndicator: boolean;
}

export async function extractLastMessage(operator: LarkOperator): Promise<LastMessage> {
  const elements = await operator.findAll({ role: 'Text' });
  if (elements.length === 0) {
    return { text: '', hasFailureIndicator: false };
  }

  const textElements = elements
    .filter(e => e.name && e.name.trim())
    .sort((a, b) =>
      (b.boundingRectangle.y + b.boundingRectangle.height) -
      (a.boundingRectangle.y + a.boundingRectangle.height)
    );

  const lastText = textElements[0]?.name || '';
  
  const ocrResult = await operator.find?.byOcr(/失败|错误|发送失败/);
  const hasFailureIndicator = !!ocrResult;

  return {
    text: lastText,
    hasFailureIndicator,
  };
}
