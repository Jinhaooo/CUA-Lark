---
name: lark_im.send_message
kind: agent_driven
description: Send a text message in the currently open Lark chat.
verify_actions: true
params_schema:
  text: string
verifyDifficulty:
  uia: high
  ocr: medium
  vlm: low
verifyStrategy:
  preferredStages:
    - name: fast
      spec:
        kind: ocr
        contains: "${params.text}"
      maxDurationMs: 1000
    - name: expensive
      spec:
        kind: vlm
        prompt: "Verify that the latest sent message exactly matches '${params.text}' and has no failed-send or retry indicator."
      maxDurationMs: 3000
---

# Send Message

Type `text` into the currently open Lark chat input and press Enter. Do not click the send button after typing; Enter submits the message.

When processing an existing message, you can right-click the target message first, then inspect the context menu to decide the next operation.

Completion criteria:
- The input returns to an empty or placeholder state.
- A new outgoing message appears at the bottom of the conversation.
- The message text exactly matches `text` and has no failed-send or retry indicator.

## Common Pitfalls

### 输入框定位失败
- 聊天窗口可能未激活
- 输入框可能被其他UI元素遮挡
- 多窗口环境下可能定位到错误窗口

### 发送失败
- 网络延迟导致消息发送超时
- 消息过长被截断
- 敏感内容被系统拦截
- 对方已拉黑或不在通讯录

### UI状态问题
- 输入框处于禁用状态（如在只读模式下）
- 聊天窗口被最小化或在后台
- 输入框聚焦但未真正激活

### 验证失败
- 消息发送后可能有延迟显示
- 消息气泡样式可能与预期不同
- 群聊中多条消息同时发送导致混淆

### 权限问题
- 可能没有发送消息的权限
- 企业限制导致无法发送外部消息
- 消息频率限制触发
