import { defineSkill, type Skill } from '@cua-lark/core';
import { z } from 'zod';

// Macro skill: not invoked via SkillRunner. Loaded into the agent's system
// prompt on demand via the `load_skill('lark_im')` tool. The execute() body
// here exists only to satisfy SkillRegistry.loadSkillFromFile() — it should
// never run.
const skill: Skill<unknown, unknown> = defineSkill({
  name: 'lark_im',
  kind: 'agent_driven',
  description: '飞书 IM 域宏工作流（通过 load_skill 注入到 system prompt）',
  params: z.object({}),
  execute: async () => ({ success: false, error: 'lark_im is a macro skill; use load_skill tool, not direct execute' }),
});

export default skill;
