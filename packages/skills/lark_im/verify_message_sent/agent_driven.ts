import { defineSkill, fuzzyContains, type Skill } from '@cua-lark/core';
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
    const shot = await ctx.operator.screenshot();
    
    const resp = await ctx.model.chatVision({
      messages: [
        { 
          role: 'user', 
          content: [
            { 
              type: 'text', 
              text: `请以 JSON 格式回答以下两个问题：
{
  "last_message_text": "<消息列表底部最后一条气泡内的纯文本，去除时间戳和发送者名称>",
  "has_failure_indicator": <true|false 是否存在红色感叹号、"重发"按钮、或灰色"发送中..."提示>
}
注意只回答 JSON，不要任何其他文字。` 
            },
            { 
              type: 'image_url', 
              image_url: { url: 'data:image/png;base64,' + shot.base64, detail: 'high' } 
            },
          ]
        },
      ],
      response_format: { type: 'json_object' },
    });
    
    let parsed;
    try {
      parsed = JSON.parse(resp.content);
    } catch {
      return { last_message_text: '', has_failure_indicator: false, parse_error: true };
    }
    
    return { 
      last_message_text: parsed.last_message_text || '', 
      has_failure_indicator: parsed.has_failure_indicator || false 
    };
  },
  verify: async (_ctx, params, result) => {
    const { text } = params;
    
    if (result.parse_error) {
      return { passed: false, reason: 'VLM 响应解析失败' };
    }
    
    const matched = fuzzyContains(result.last_message_text, text);
    if (!matched) {
      return { 
        passed: false, 
        reason: `底部消息 "${result.last_message_text}" 与期望 "${text}" 不匹配` 
      };
    }
    
    if (result.has_failure_indicator) {
      return { passed: false, reason: '消息存在失败/重发标志' };
    }
    
    return { passed: true, reason: `消息 "${text}" 已确认发送` };
  }
});

export default skill;
