---
name: lark_im.recall_last_message
kind: procedural
description: Recall the latest outgoing message matching exact text in the current Lark chat.
verify_actions: true
fallback: false
params_schema:
  text: string
verifyDifficulty:
  uia: high
  ocr: medium
  vlm: low
---

# Recall Last Message

Recall only the latest outgoing message whose visible text exactly matches `text` in the currently open Lark chat.

When processing an existing message, you can right-click the target message first, then inspect the context menu to decide the next operation.

Completion criteria:
- At most one message is recalled.
- The target must be the latest outgoing message matching `text`.
- After opening the message context menu, click the Recall/撤回 menu item itself, not a nearby menu item or blank space.
- Right-clicking the target message should open the context menu directly; do not use the three-dot/more-options toolbar path.
- A visible recall success notice, such as "你撤回了一条消息" or "You recalled a message", is the success standard.
- Do not search the whole chat history.
- Stop immediately after the matching message is recalled or if no matching latest outgoing message is visible.
