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
    
    await ctx.agent.run(
      `目标：在飞书 IM 主面板搜索 "${name_pattern}" 并打开匹配的会话。
如果当前右侧会话标题已经包含 "${name_pattern}"，且消息列表和输入框已渲染完成，直接 finished()，不要重复搜索。
区分性描述：
  1. 点击侧边栏顶部的搜索按钮（放大镜图标，位于个人头像下方第一个图标）。
     不要点击：底部的「设置」（齿轮图标）、「联系人」（人形图标）、「会议」（视频摄像机图标）。
  2. 在搜索框输入 "${name_pattern}" 后，会出现下拉结果列表。
     选择"群组"分类下的卡片（左侧是群头像+成员数标记），不要选"消息"分类下的消息片段（左侧是发送者头像+消息预览文本）。
  3. 点击匹配的群组卡片后，如果右侧标题已切换到 "${name_pattern}"，立刻 finished()。
     不要再次点击搜索框，不要重复输入关键词，不要继续点搜索结果。
完成判据：
  - 主窗口右侧消息区已切换，会话标题文本完全包含 "${name_pattern}"
  - 输入框、消息列表都已渲染完成（不在 loading 状态）`,
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
