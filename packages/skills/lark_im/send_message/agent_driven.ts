import { defineSkill, type Skill } from '@cua-lark/core';
import { z } from 'zod';

const skill: Skill<any, any> = defineSkill({
  name: 'lark_im.send_message',
  kind: 'agent_driven',
  description: '在当前会话中发送文本消息',
  manual: '在当前打开会话的输入框中输入文本，然后按 Enter 键发送',
  params: z.object({
    text: z.string()
  }),
  execute: async (ctx, params) => {
    const { text } = params;
    
    await ctx.agent.run(
      `目标：在当前会话发送一条文本消息 "${text}"。
区分性描述：
  1. 输入框位于消息区下方，是一个白色多行可输入区域（带灰色 placeholder "输入消息..."）。
     不要点击：上方工具栏中的"@"按钮、"表情"按钮、"附件"按钮（它们是图标按钮）；
     也不要点击右下角的"语音"或"视频"按钮（它们是圆形图标按钮）。
  2. 用 type 动作只输入 "${text}"，不要在 type 内容里附加 "\\n"。
  3. 输入完成后，用键盘 Enter 提交，例如 hotkey(key='enter')。
     不要点击右下角发送按钮；除非按 Enter 后明确没有发送，才允许作为最后兜底点击发送按钮。
  4. 确认发送成功后必须严格输出两行：
     Thought: 消息已通过 Enter 发送，输入框已清空，底部出现目标消息气泡。
     Action: finished()
     不要只输出 finished()，不要省略 "Action:" 前缀。
完成判据：
  - 输入框文本被清空（恢复 placeholder 状态）
  - 消息列表底部新增一条消息气泡，文本完全等于 "${text}"
  - 该气泡靠右显示（自己发出的消息），无红色感叹号或重发按钮`,
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
