---
name: lark_im.search_contact
kind: agent_driven
description: 搜索联系人或群组并打开会话
params_schema:
  name_pattern: string
---

# 搜索联系人

## 功能说明
- 在飞书侧边栏搜索栏中输入关键词
- 找到名称包含该字段的会话
- 点击进入会话

## 完成判据
- 右侧消息区已切换到该会话
- 会话标题包含搜索关键词