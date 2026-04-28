import type { Context, VerifyResult, VerifySpec } from '../types.js';

export interface Verifier {
  run(spec: VerifySpec, ctx: Context): Promise<VerifyResult>;
}

export type { VerifySpec } from '../types.js';
