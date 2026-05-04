/**
 * OcrVerifier - OCR验证器
 * 
 * 使用OCR技术识别截图中的文字，并进行模糊匹配验证
 */

import type { Verifier } from './types.js';
import type { Context, VerifyResult, VerifySpec, OcrClient } from '../types.js';
import { fuzzyContains } from '../util/fuzzy.js';

export class OcrVerifier implements Verifier {
  /**
   * 执行OCR验证
   * 
   * @param spec - 验证规范（包含要查找的文本）
   * @param ctx - 上下文
   * @returns 验证结果
   */
  async run(spec: Extract<VerifySpec, { kind: 'ocr' }>, ctx: Context): Promise<VerifyResult> {
    try {
      // 获取OCR客户端
      const ocr = ctx.ocr as OcrClient | null;
      if (!ocr) {
        return {
          passed: false,
          reason: 'OCR client not available'
        };
      }

      // 获取截图
      const shot = await ctx.operator.screenshot();
      const imageBuffer = Buffer.from(shot.base64, 'base64');

      // 使用OCR识别文字
      const tokens = await ocr.recognize(imageBuffer);

      // 提取所有识别到的文本
      const allText = tokens.map(t => t.text).join(' ');

      // 使用模糊匹配检查目标文本是否存在
      let found = false;
      if (typeof spec.contains === 'string') {
        found = fuzzyContains(allText, spec.contains);
      } else {
        found = spec.contains.test(allText);
      }

      if (found) {
        return {
          passed: true,
          reason: `OCR 识别到文本: "${spec.contains}"`
        };
      } else {
        return {
          passed: false,
          reason: `OCR 未找到文本: "${spec.contains}"。识别到的文本: "${allText}"`
        };
      }
    } catch (error) {
      return {
        passed: false,
        reason: error instanceof Error ? error.message : 'OCR 验证失败'
      };
    }
  }

  /**
   * 验证方法（实现Verifier接口）
   */
  async verify(spec: Extract<VerifySpec, { kind: 'ocr' }>, ctx: Context): Promise<VerifyResult> {
    return this.run(spec, ctx);
  }
}