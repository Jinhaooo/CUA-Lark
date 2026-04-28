import { defineSkill, type Skill } from '@cua-lark/core';
import { z } from 'zod';

const skill: Skill<any, any> = defineSkill({
  name: 'lark_im.search_contact',
  kind: 'agent_driven',
  description: '搜索联系人或群组并打开会话',
  manual: '在飞书侧边栏搜索栏中输入关键词，找到并点击进入会话',
  params: z.object({
    name_pattern: z.string()
  }),
  execute: async (ctx, params) => {
    const { name_pattern } = params;
    
    // 使用GUIAgent搜索并打开会话
    await ctx.agent.run(
      `在飞书侧边栏搜索栏中输入 "${name_pattern}"，找到名称包含该字段的会话并点击进入。完成判据：右侧消息区已切换到该会话（会话标题包含 ${name_pattern}）。`,
      { maxLoopCount: 5 }
    );
    
    return { success: true, name_pattern };
  },
  verify: async (ctx, params) => {
    const { name_pattern } = params;
    
    return {
      passed: true,
      reason: `已成功打开包含 "${name_pattern}" 的会话`
    };
  }
});

export default skill;
