---
name: lark_docs.verify_doc_exists
kind: agent_driven
description: Verify that a Lark document is visible.
verify_actions: true
params_schema:
  title: string
verifyDifficulty:
  uia: medium
  ocr: low
  vlm: low
---

# Verify Doc Exists

Verify that a document whose title contains `title` is visible in Docs.
