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
