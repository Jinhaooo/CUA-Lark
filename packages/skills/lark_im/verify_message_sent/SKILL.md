---
name: lark_im.verify_message_sent
kind: agent_driven
description: 验证消息是否成功发送
params_schema:
  text: string
---

# 验证消息发送

## 功能说明
- 检查消息列表底部是否有指定文本的消息
- 验证消息是否成功发送（无失败/重发标志）

## 完成判据
- 消息列表底部最后一条消息文本与指定文本一致
- 消息无失败/重发标志（如红色感叹号等）