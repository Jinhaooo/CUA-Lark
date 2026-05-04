---
name: lark_im.verify_message_sent
kind: agent_driven
description: Verify that a text message was sent successfully in the current Lark chat.
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
        prompt: "Verify that the latest visible message exactly matches '${params.text}' and has no failed-send or retry indicator."
      maxDurationMs: 3000
---

# Verify Message Sent

Check the bottom of the current Lark conversation and verify that the latest visible message matches `text` without any failed-send or retry indicator.

When processing an existing message, you can right-click the target message first, then inspect the context menu to decide the next operation.
