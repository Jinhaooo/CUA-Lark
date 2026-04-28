---
name: lark_im.send_message
kind: agent_driven
description: 在当前会话中发送文本消息
params_schema:
  text: string
---

# 发送消息

## 功能说明
- 在当前打开会话的输入框中输入文本
- 按回车键发送消息

## 完成判据
- 输入框已清空
- 消息列表底部出现一条新消息
- 新消息文本与发送内容一致