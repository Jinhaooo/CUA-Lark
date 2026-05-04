/**
 * A11yVerifier - 辅助功能验证器
 *
 * 使用UIA(Windows UI Automation)进行元素存在性验证
 */

import type { Verifier } from './types.js';
import type { Context, VerifyResult, VerifySpec } from '../types.js';

export class A11yVerifier implements Verifier {
  async run(spec: Extract<VerifySpec, { kind: 'a11y' }>, ctx: Context): Promise<VerifyResult> {
    try {
      const uia = (ctx as any).uia;
      if (!uia) {
        return {
          passed: false,
          reason: 'UIA client not available'
        };
      }

      const result = await uia.findElement({
        role: spec.role,
        name: spec.name,
        scope: 'descendants'
      });

      if (result) {
        return {
          passed: true,
          reason: `A11y 找到元素: ${spec.role} "${spec.name}"`
        };
      } else {
        return {
          passed: false,
          reason: `A11y 未找到元素: ${spec.role} "${spec.name}"`
        };
      }
    } catch (error) {
      return {
        passed: false,
        reason: error instanceof Error ? error.message : 'A11y 验证失败'
      };
    }
  }

  async verify(spec: Extract<VerifySpec, { kind: 'a11y' }>, ctx: Context): Promise<VerifyResult> {
    return this.run(spec, ctx);
  }
}