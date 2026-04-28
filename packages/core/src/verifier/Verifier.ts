import type { Verifier as VerifierInterface } from './types.js';
import type { Context, VerifyResult, VerifySpec } from '../types.js';
import { VlmVerifier } from './VlmVerifier.js';
import { CompositeVerifier } from './CompositeVerifier.js';

export class Verifier implements VerifierInterface {
  private vlmVerifier: VlmVerifier;
  private compositeVerifier: CompositeVerifier;

  constructor(model: any) {
    this.vlmVerifier = new VlmVerifier(model);
    this.compositeVerifier = new CompositeVerifier(this);
  }

  async run(spec: VerifySpec, ctx: Context): Promise<VerifyResult> {
    // 实现失败重试逻辑
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await this.runOnce(spec, ctx);
        if (result.passed) {
          return result;
        }
        // 失败后重试
        lastError = new Error(result.reason);
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (lastError.message.includes('M3+')) {
          throw lastError;
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    return {
      passed: false,
      reason: lastError ? lastError.message : 'Verification failed after multiple attempts'
    };
  }

  private async runOnce(spec: VerifySpec, ctx: Context): Promise<VerifyResult> {
    switch (spec.kind) {
      case 'vlm':
        return this.vlmVerifier.run(spec, ctx);
      case 'all':
      case 'any':
        return this.compositeVerifier.run(spec, ctx);
      case 'ocr':
      case 'pixel':
      case 'a11y':
        throw new Error(`待 M3+ 接入：kind=${spec.kind}`);
      default:
        throw new Error(`Unknown verification kind: ${(spec as any).kind}`);
    }
  }
}
