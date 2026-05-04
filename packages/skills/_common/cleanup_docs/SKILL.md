---
name: _common.cleanup_docs
kind: agent_driven
description: Delete or move test documents to trash by folder and title prefix.
verify_actions: true
params_schema:
  folderName: string
  titlePrefix: string
verifyDifficulty:
  uia: high
  ocr: medium
  vlm: low
---

# Cleanup Docs

Use the Docs GUI to find documents in `folderName` whose titles start with `titlePrefix`, then delete or move them to trash. Use only GUI operations.
