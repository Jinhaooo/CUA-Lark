/**
 * Verifier类型定义
 * 
 * 定义验证器的核心接口和类型
 */

import type { Context, VerifySpec, VerifyResult } from '../types.js';

/**
 * 验证器接口
 */
export interface Verifier {
  /**
   * 执行验证（run方法）
   * @param spec - 验证规范
   * @param ctx - 上下文
   * @returns 验证结果
   */
  run(spec: VerifySpec, ctx: Context): Promise<VerifyResult>;

  /**
   * 执行验证（verify方法，别名）
   * @param spec - 验证规范
   * @param ctx - 上下文
   * @returns 验证结果
   */
  verify(spec: VerifySpec, ctx: Context): Promise<VerifyResult>;
}