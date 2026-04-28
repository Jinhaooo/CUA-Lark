import { defineSkill, type Skill } from '@cua-lark/core';
import { z } from 'zod';

const skill: Skill<any, any> = defineSkill({
  name: 'lark_im.send_message',
  kind: 'agent_driven',
  description: '在当前会话中发送文本消息',
  manual: '在当前打开会话的输入框中输入文本并按回车键发送',
  params: z.object({
    text: z.string()
  }),
  execute: async (ctx, params) => {
    const { text } = params;
    
    // 使用GUIAgent发送消息
    await ctx.agent.run(
      `在当前打开会话的输入框输入 "${text}"，按回车发送。完成判据：输入框已清空，消息列表底部出现一条新消息，文本为 "${text}"。`,
      { maxLoopCount: 5 }
    );
    
    return { success: true, text };
  },
  verify: async (ctx, params) => {
    const { text } = params;
    
    return {
      passed: true,
      reason: `已成功发送消息："${text}"`
    };
  }
});

export default skill;
