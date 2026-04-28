import type { Skill, SkillDef } from './types.js';

export function defineSkill<P = unknown, R = unknown>(spec: SkillDef<P, R>): Skill<P, R> {
  if (!spec.name) {
    throw new Error('Skill name is required');
  }
  return spec;
}
