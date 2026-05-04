import { z } from 'zod';
import type { Tool } from '../types.js';
import { OcrVerifier } from '../../verifier/OcrVerifier.js';
import type { Box } from '../../types.js';

export const verifyOcrTool: Tool<{ text: string | RegExp; region?: Box }> = {
  name: 'verify_ocr',
  description: 'Verify that specified text is present on screen using OCR.',
  argsSchema: z.object({
    text: z.union([z.string(), z.instanceof(RegExp)]),
    region: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    }).optional(),
  }),
  async execute(ctx, args) {
    try {
      const verifier = new OcrVerifier();
      const result = await verifier.verify(
        { kind: 'ocr', contains: args.text, in: args.region },
        ctx as any
      );

      return {
        success: true,
        data: result,
        observation: result.passed
          ? `OCR verify passed: text found`
          : `OCR verify failed: ${result.reason}`,
      };
    } catch (error) {
      return {
        success: false,
        observation: `OCR verify failed: ${error}`,
        error: { kind: 'verify_failed', message: String(error) },
      };
    }
  },
  category: 'verify',
  costHint: 'cheap',
};