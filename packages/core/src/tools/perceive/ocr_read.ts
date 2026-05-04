import { z } from 'zod';
import type { Tool } from '../types.js';
import type { OcrToken } from '../../types.js';

export const ocrReadTool: Tool<
  { region: { x1: number; y1: number; x2: number; y2: number } },
  OcrToken[]
> = {
  name: 'ocr_read',
  description: 'Read all text in a specified region using OCR. Returns an array of recognized text tokens with positions.',
  argsSchema: z.object({
    region: z.object({
      x1: z.number(),
      y1: z.number(),
      x2: z.number(),
      y2: z.number(),
    }),
  }),
  async execute(ctx, args) {
    if (!ctx.ocr) {
      return {
        success: false,
        observation: 'OCR client not available',
        error: { kind: 'locator_failed', message: 'OCR client not initialized' },
      };
    }

    try {
      const screenshot = await ctx.operator.screenshot();
      const imageBuffer = Buffer.from(screenshot.base64, 'base64');
      const tokens = await ctx.ocr.recognize(imageBuffer, args.region);

      const texts = tokens.map((t) => t.text).join(' ');

      return {
        success: true,
        data: tokens,
        observation: `Region contains: '${texts}'`,
      };
    } catch (error) {
      return {
        success: false,
        observation: `OCR read failed: ${error}`,
        error: { kind: 'locator_failed', message: String(error) },
      };
    }
  },
  category: 'perceive',
  costHint: 'cheap',
};