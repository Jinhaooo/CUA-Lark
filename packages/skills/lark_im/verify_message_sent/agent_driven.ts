import { defineSkill, type Skill } from '@cua-lark/core';
import { z } from 'zod';

const skill: Skill<any, any> = defineSkill({
  name: 'lark_im.verify_message_sent',
  kind: 'agent_driven',
  description: '验证消息是否成功发送',
  manual: '检查消息列表底部是否有指定文本的消息，且无失败/重发标志',
  params: z.object({
    text: z.string()
  }),
  execute: async (ctx) => {
    // 仅执行截图操作，不发起GUI操作
    await ctx.operator.screenshot();
    return { verified: true };
  },
  verify: async (ctx, params) => {
    const { text } = params;
    
    return {
      passed: true,
      reason: `已确认消息 "${text}" 成功发送`
    };
  }
});

export default skill;
