import type { Verifier } from './types.js';
import type { Context, VerifyResult, VerifySpec, OcrClient } from '../types.js';
import { fuzzyContains } from '../util/fuzzy.js';

export class OcrVerifier implements Verifier {
  async run(spec: Extract<VerifySpec, { kind: 'ocr' }>, ctx: Context): Promise<VerifyResult> {
    try {
      const ocr = ctx.ocr as OcrClient | null;
      if (!ocr) {
        return {
          passed: false,
          reason: 'OCR client not available'
        };
      }

      const snapshot = await ctx.snapshot();
      
      if (!snapshot.screenshotBase64) {
        return {
          passed: false,
          reason: 'No screenshot available for OCR verification'
        };
      }

      const imageBuffer = Buffer.from(snapshot.screenshotBase64, 'base64');
      
      let tokens: { text: string; box: [number, number, number, number]; confidence: number }[];
      
      if (spec.in) {
        tokens = await ocr.recognize(imageBuffer, {
          x1: spec.in.x,
          y1: spec.in.y,
          x2: spec.in.x + spec.in.width,
          y2: spec.in.y + spec.in.height
        });
      } else {
        tokens = await ocr.recognize(imageBuffer);
      }

      const ocrText = tokens.map(t => t.text).join(' ');

      let matched = false;
      if (spec.contains instanceof RegExp) {
        matched = spec.contains.test(ocrText);
      } else {
        matched = fuzzyContains(ocrText, spec.contains);
      }

      if (matched) {
        return {
          passed: true,
          reason: `OCR verification passed: found "${spec.contains}"`,
          evidence: { ocrText }
        };
      } else {
        return {
          passed: false,
          reason: `OCR verification failed: did not find "${spec.contains}" in OCR text`,
          evidence: { ocrText }
        };
      }
    } catch (error) {
      return {
        passed: false,
        reason: `OCR verification failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}