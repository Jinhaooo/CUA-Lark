import { defineSkill, type Skill } from '@cua-lark/core';
import { z } from 'zod';

// Macro skill: not invoked via SkillRunner. Loaded into the agent's system
// prompt on demand via load_skill('lark_docs'). The execute() body exists
// only to satisfy SkillRegistry.loadSkillFromFile(); it should never run.
const skill: Skill<unknown, unknown> = defineSkill({
  name: 'lark_docs',
  kind: 'agent_driven',
  description: '飞书云文档域宏工作流（新建 / 打开 / 编辑标题等，通过 load_skill 注入）',
  params: z.object({}),
  execute: async () => ({ success: false, error: 'lark_docs is a macro skill; use load_skill tool, not direct execute' }),
});

export default skill;
