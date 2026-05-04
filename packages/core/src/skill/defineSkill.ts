/**
 * defineSkill - 技能定义工厂函数
 * 
 * 提供类型安全的技能定义方式，确保技能结构正确
 */

import type { SkillDef, Skill } from './types.js';

/**
 * 创建技能定义
 * 
 * @param def - 技能定义对象
 * @returns 技能对象
 */
export function defineSkill<P = unknown, R = unknown>(def: SkillDef<P, R>): Skill<P, R> {
  if (!def.name) {
    throw new Error('Skill name is required');
  }
  if (!def.kind) {
    throw new Error('Skill kind is required');
  }
  if (!def.description) {
    throw new Error('Skill description is required');
  }

  return {
    name: def.name,
    kind: def.kind,
    description: def.description,
    manual: def.manual,
    fallback: def.fallback,
    params: def.params,
    preconditions: def.preconditions,
    execute: def.execute,
    verify: def.verify,
    uses: def.uses,
    verifyActions: def.verifyActions,
    sideEffects: def.sideEffects,
  };
}
