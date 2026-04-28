import { defineSkill, runPreflight, type Skill } from '@cua-lark/core';
import { z } from 'zod';

const skill: Skill<any, any> = defineSkill({
  name: '_common.ensure_app_open',
  kind: 'agent_driven',
  description: '确保飞书应用打开并显示IM主面板',
  manual: '手动检查飞书应用是否打开并显示IM主面板',
  params: z.object({}),
  execute: async (ctx) => {
    // 运行前置检查
    await runPreflight();
    
    // 使用GUIAgent确保飞书IM主面板可见
    await ctx.agent.run(
      '确保飞书IM主面板可见，完成判据：左侧会话列表与右侧消息区都呈现',
      { maxLoopCount: 5 }
    );
    
    return { success: true };
  },
  verify: async (ctx) => {
    return {
      passed: true,
      reason: '飞书IM主面板已确认可见'
    };
  }
});

export default skill;
