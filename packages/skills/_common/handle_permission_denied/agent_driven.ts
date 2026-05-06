import { defineSkill, type Skill } from '@cua-lark/core';
import { z } from 'zod';

// Macro skill: not invoked via SkillRunner. Loaded into the agent's system
// prompt on demand via load_skill('_common.handle_permission_denied').
const skill: Skill<unknown, unknown> = defineSkill({
  name: '_common.handle_permission_denied',
  kind: 'agent_driven',
  description: '处理权限拒绝场景：识别权限弹窗、记录证据、尝试替代方案或提示用户手动授权',
  params: z.object({
    permissionType: z.string().optional(),
  }),
  execute: async () => ({ success: false, error: 'macro skill; use load_skill, not direct execute' }),
});

export default skill;
