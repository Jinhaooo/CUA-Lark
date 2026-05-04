/**
 * Verifier - 验证器主调度器
 *
 * 作为验证器的统一入口，根据验证规范类型分发到对应验证器
 */

import type { Context, VerifyResult, VerifySpec } from '../types.js';
import { VlmVerifier } from './VlmVerifier.js';
import { OcrVerifier } from './OcrVerifier.js';
import { A11yVerifier } from './A11yVerifier.js';
import { StagedVerifier } from './StagedVerifier.js';

export class Verifier {
  private vlmVerifier: VlmVerifier;
  private ocrVerifier: OcrVerifier;
  private a11yVerifier: A11yVerifier;
  private stagedVerifier: StagedVerifier;

  constructor() {
    this.vlmVerifier = new VlmVerifier();
    this.ocrVerifier = new OcrVerifier();
    this.a11yVerifier = new A11yVerifier();
    this.stagedVerifier = new StagedVerifier((subSpec, ctx) => this.verify(subSpec, ctx));
  }

  async run(spec: VerifySpec, ctx: Context): Promise<VerifyResult> {
    return this.verify(spec, ctx);
  }

  async verify(spec: VerifySpec, ctx: Context): Promise<VerifyResult> {
    switch (spec.kind) {
      case 'vlm':
        return this.vlmVerifier.verify(spec, ctx);

      case 'ocr':
        return this.ocrVerifier.verify(spec, ctx);

      case 'a11y':
        return this.a11yVerifier.verify(spec, ctx);

      case 'staged':
        return this.stagedVerifier.verify(spec, ctx);

      case 'all': {
        for (const subSpec of spec.of) {
          const result = await this.verify(subSpec, ctx);
          if (!result.passed) {
            return result;
          }
        }
        return { passed: true, reason: 'All verifications passed' };
      }

      case 'any': {
        for (const subSpec of spec.of) {
          const result = await this.verify(subSpec, ctx);
          if (result.passed) {
            return result;
          }
        }
        return { passed: false, reason: 'None of the verifications passed' };
      }

      case 'pixel':
        throw new Error('待 M3+ 接入：kind=pixel');

      default:
        return {
          passed: false,
          reason: `Unknown verify kind: ${(spec as VerifySpec).kind}`
        };
    }
  }
}
