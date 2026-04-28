---
name: lark_im.verify_message_sent
kind: agent_driven
description: 验证消息是否成功发送
verify_actions: true
params_schema:
  text: string
---

# 验证消息发送

## 功能说明
- 使用VLM分析截图，提取消息列表底部最后一条消息的文本
- 验证消息是否成功发送（无失败/重发标志）
- 使用fuzzy match判定（Levenshtein距离≤1）

## 完成判据
- 消息列表底部最后一条消息文本与指定文本匹配（允许1字差异）
- 消息无失败/重发标志（如红色感叹号、"重发"按钮、灰色"发送中..."提示）