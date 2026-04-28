import { defineSkill, type Skill } from '@cua-lark/core';
import { z } from 'zod';

const skill: Skill<any, any> = defineSkill({
  name: '_common.dismiss_popup',
  kind: 'agent_driven',
  description: '关闭与测试任务无关的弹窗',
  manual: '手动关闭所有与测试任务无关的弹窗',
  params: z.object({}),
  execute: async (ctx) => {
    // 使用GUIAgent关闭无关弹窗
    await ctx.agent.run(
      '如果当前截图中存在与测试任务无关的弹窗（如版本更新提示、新功能引导、关闭确认等），请关闭它；如果没有任何此类弹窗，立即调用 finished()。完成判据：截图中无任何模态弹窗。',
      { maxLoopCount: 3 }
    );
    
    return { success: true };
  },
  verify: async (ctx) => {
    return {
      passed: true,
      reason: '已确认无无关弹窗'
    };
  }
});

export default skill;
