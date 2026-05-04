import { z } from 'zod';
import type { Tool } from '../types.js';

export const ocrLocateTool: Tool<
  { text: string; region?: { x1: number; y1: number; x2: number; y2: number } },
  { x1: number; y1: number; x2: number; y2: number } | null
> = {
  name: 'ocr_locate',
  description: 'Locate text on screen using OCR. Returns the bounding box of the text if found, or null if not found.',
  argsSchema: z.object({
    text: z.string(),
    region: z.object({
      x1: z.number(),
      y1: z.number(),
      x2: z.number(),
      y2: z.number(),
    }).optional(),
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
      const result = await ctx.ocr.locate(imageBuffer, args.text);

      if (!result) {
        return {
          success: true,
          data: null,
          observation: `Text '${args.text}' not found`,
        };
      }

      return {
        success: true,
        data: result,
        observation: `Found text '${args.text}' at (${result.x1},${result.y1},${result.x2},${result.y2})`,
      };
    } catch (error) {
      return {
        success: false,
        observation: `OCR locate failed: ${error}`,
        error: { kind: 'locator_failed', message: String(error) },
      };
    }
  },
  category: 'perceive',
  costHint: 'cheap',
};