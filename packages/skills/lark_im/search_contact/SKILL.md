---
name: lark_im.search_contact
kind: agent_driven
description: Search a Lark contact or group and open the matching chat.
verify_actions: true
params_schema:
  name_pattern: string
verifyDifficulty:
  uia: low
  ocr: low
  vlm: low
---

# Search Contact

Use Lark global search to find the contact or group whose name contains `name_pattern`, then open that chat.

When processing an existing message, you can right-click the target message first, then inspect the context menu to decide the next operation.

Completion criteria:
- The main conversation area has switched to the matching chat.
- The chat title contains `name_pattern`.
- The message list and input box are visible.
