/**
 * CompositeVerifier - 组合验证器
 * 
 * 支持组合多个验证规范，并行或串行执行验证
 */

import type { Verifier } from './types.js';
import type { Context, VerifyResult, VerifySpec } from '../types.js';

export class CompositeVerifier implements Verifier {
  private vlmVerifier: Verifier;
  private ocrVerifier: Verifier;

  /**
   * 构造函数
   * @param vlmVerifier - VLM验证器
   * @param ocrVerifier - OCR验证器
   */
  constructor(vlmVerifier: Verifier, ocrVerifier: Verifier) {
    this.vlmVerifier = vlmVerifier;
    this.ocrVerifier = ocrVerifier;
  }

  /**
   * 执行验证（run方法，别名）
   * 
   * @param spec - 验证规范
   * @param ctx - 上下文
   * @returns 验证结果
   */
  async run(spec: VerifySpec, ctx: Context): Promise<VerifyResult> {
    return this.verify(spec, ctx);
  }

  /**
   * 执行组合验证
   * 
   * 根据验证规范的类型分发到对应的验证器
   * 
   * @param spec - 验证规范
   * @param ctx - 上下文
   * @returns 验证结果
   */
  async verify(spec: VerifySpec, ctx: Context): Promise<VerifyResult> {
    switch (spec.kind) {
      case 'vlm':
        return this.vlmVerifier.run(spec, ctx);
      
      case 'ocr':
        return this.ocrVerifier.run(spec, ctx);
      
      case 'composite':
        return this.verifyComposite(spec, ctx);
      
      case 'all':
        return this.verifyAll(spec, ctx);
      
      case 'any':
        return this.verifyAny(spec, ctx);
      
      default:
        return {
          passed: false,
          reason: `Unknown verifier kind: ${(spec as VerifySpec).kind}`
        };
    }
  }

  /**
   * 执行组合验证（多个子验证规范）
   * 
   * 所有子验证必须全部通过才视为通过
   * 
   * @param spec - 组合验证规范
   * @param ctx - 上下文
   * @returns 验证结果
   */
  private async verifyComposite(spec: Extract<VerifySpec, { kind: 'composite' }>, ctx: Context): Promise<VerifyResult> {
    for (const subSpec of spec.specs) {
      const result = await this.verify(subSpec, ctx);
      if (!result.passed) {
        return result;
      }
    }

    return {
      passed: true,
      reason: '所有验证项通过'
    };
  }

  /**
   * 执行ALL验证（所有子验证都通过才算通过）
   * 
   * @param spec - ALL验证规范
   * @param ctx - 上下文
   * @returns 验证结果
   */
  private async verifyAll(spec: Extract<VerifySpec, { kind: 'all' }>, ctx: Context): Promise<VerifyResult> {
    if (!spec.of || spec.of.length === 0) {
      return {
        passed: false,
        reason: 'No specifications provided for ALL verification'
      };
    }

    for (const subSpec of spec.of) {
      const result = await this.verify(subSpec, ctx);
      if (!result.passed) {
        return {
          passed: false,
          reason: `One verification failed: ${result.reason}`
        };
      }
    }

    return {
      passed: true,
      reason: 'All verifications passed'
    };
  }

  /**
   * 执行ANY验证（任意一个子验证通过就算通过）
   * 
   * @param spec - ANY验证规范
   * @param ctx - 上下文
   * @returns 验证结果
   */
  private async verifyAny(spec: Extract<VerifySpec, { kind: 'any' }>, ctx: Context): Promise<VerifyResult> {
    if (!spec.of || spec.of.length === 0) {
      return {
        passed: true,
        reason: 'No specifications provided for ANY verification'
      };
    }

    let lastFailureReason = '';
    
    for (const subSpec of spec.of) {
      const result = await this.verify(subSpec, ctx);
      if (result.passed) {
        return {
          passed: true,
          reason: `At least one verification passed: ${result.reason}`
        };
      }
      lastFailureReason = result.reason;
    }

    return {
      passed: false,
      reason: 'None of the verifications passed'
    };
  }
}