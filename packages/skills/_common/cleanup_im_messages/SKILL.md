---
name: _common.cleanup_im_messages
kind: agent_driven
description: Recall or delete recent test IM messages by chat and content pattern.
verify_actions: true
params_schema:
  chatPattern: string
  contentPattern: string
verifyDifficulty:
  uia: high
  ocr: medium
  vlm: low
---

# Cleanup IM Messages

Open the target chat and recall or delete recent messages sent by the current user whose content matches `contentPattern`. Use only GUI operations.
