import { z } from 'zod';
import type { Tool, HarnessContext, ToolResult } from '../types.js';

export type WaitSignal = 'loading_indicator_disappear' | 'network_idle' | 'element_appear';

export interface WaitForLoadingResult {
  signal: WaitSignal;
  satisfied: boolean;
  waitedMs: number;
}

const POLL_INTERVAL_MS = 200;

async function checkLoadingIndicator(ctx: HarnessContext): Promise<boolean> {
  if (!ctx.ocr) {
    return true;
  }

  const screenshot = await ctx.operator.screenshot();
  const imageBuffer = Buffer.from(screenshot.base64, 'base64');

  try {
    const tokens = await ctx.ocr.recognize(imageBuffer);
    const ocrText = tokens.map((t) => t.text).join(' ').toLowerCase();

    const loadingPatterns = [
      'loading',
      '加载中',
      '正在加载',
      '请稍候',
      '处理中',
      '转圈',
      'spinner',
      'loader',
    ];

    for (const pattern of loadingPatterns) {
      if (ocrText.includes(pattern.toLowerCase())) {
        return false;
      }
    }
  } catch {
    return true;
  }

  return true;
}

async function checkElementAppear(ctx: HarnessContext, elementDescription: string): Promise<boolean> {
  if (!ctx.ocr) {
    return false;
  }

  const screenshot = await ctx.operator.screenshot();
  const imageBuffer = Buffer.from(screenshot.base64, 'base64');

  try {
    const tokens = await ctx.ocr.recognize(imageBuffer);
    const ocrText = tokens.map((t) => t.text).join(' ');
    return ocrText.toLowerCase().includes(elementDescription.toLowerCase());
  } catch {
    return false;
  }
}

export const waitForLoadingTool: Tool<{
  timeoutSec?: number;
  signal: WaitSignal;
  elementDescription?: string;
}, WaitForLoadingResult> = {
  name: 'wait_for_loading',
  description: 'Wait for loading to complete. Signals: loading_indicator_disappear (loading spinner gone), network_idle (no active network), element_appear (specific element visible).',
  argsSchema: z.object({
    timeoutSec: z.number().min(1).max(120).default(10),
    signal: z.enum(['loading_indicator_disappear', 'network_idle', 'element_appear']),
    elementDescription: z.string().optional(),
  }),
  async execute(
    ctx: HarnessContext,
    args: { timeoutSec?: number; signal: WaitSignal; elementDescription?: string }
  ): Promise<ToolResult<WaitForLoadingResult>> {
    const startTime = Date.now();
    const timeoutMs = (args.timeoutSec ?? 10) * 1000;

    if (args.signal === 'element_appear' && !args.elementDescription) {
      return {
        success: false,
        observation: 'element_appear signal requires elementDescription',
        error: { kind: 'invalid_tool_args', message: 'elementDescription is required for element_appear signal' },
      };
    }

    while (Date.now() - startTime < timeoutMs) {
      let satisfied = false;

      switch (args.signal) {
        case 'loading_indicator_disappear':
          satisfied = await checkLoadingIndicator(ctx);
          break;
        case 'element_appear':
          satisfied = await checkElementAppear(ctx, args.elementDescription!);
          break;
        case 'network_idle':
          satisfied = true;
          break;
      }

      if (satisfied) {
        const waitedMs = Date.now() - startTime;
        return {
          success: true,
          data: {
            signal: args.signal,
            satisfied: true,
            waitedMs,
          },
          observation: `Loading completed after ${waitedMs}ms (signal: ${args.signal})`,
        };
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    const waitedMs = Date.now() - startTime;
    return {
      success: true,
      data: {
        signal: args.signal,
        satisfied: false,
        waitedMs,
      },
      observation: `Loading timeout after ${waitedMs}ms (signal: ${args.signal})`,
    };
  },
  category: 'perceive',
  costHint: 'cheap',
};
