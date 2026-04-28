import type { Verifier } from './types.js';
import type { Context, VerifyResult, VerifySpec } from '../types.js';

export class CompositeVerifier implements Verifier {
  private verifier: Verifier;

  constructor(verifier: Verifier) {
    this.verifier = verifier;
  }

  async run(spec: Extract<VerifySpec, { kind: 'all' | 'any' }>, ctx: Context): Promise<VerifyResult> {
    if (!spec.of || spec.of.length === 0) {
      return {
        passed: spec.kind === 'all' ? false : true,
        reason: spec.kind === 'all' ? 'No specifications provided for ALL verification' : 'No specifications provided for ANY verification'
      };
    }

    const results: VerifyResult[] = [];
    
    for (const subSpec of spec.of) {
      const result = await this.verifier.run(subSpec, ctx);
      results.push(result);
      
      if (spec.kind === 'any' && result.passed) {
        return {
          passed: true,
          reason: `At least one verification passed: ${result.reason}`
        };
      }
      
      if (spec.kind === 'all' && !result.passed) {
        return {
          passed: false,
          reason: `One verification failed: ${result.reason}`
        };
      }
    }

    if (spec.kind === 'all') {
      return {
        passed: true,
        reason: 'All verifications passed'
      };
    } else {
      return {
        passed: false,
        reason: 'None of the verifications passed'
      };
    }
  }
}
