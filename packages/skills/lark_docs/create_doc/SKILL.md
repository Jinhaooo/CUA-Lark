---
name: lark_docs.create_doc
kind: agent_driven
description: Create a Lark document.
verify_actions: true
params_schema:
  title: string
  body: string
verifyDifficulty:
  uia: medium
  ocr: low
  vlm: low
sideEffects:
  docs:
    createdDocs:
      titlePattern: "${params.title}"
      folderRef: "configs:docs.test_folder_name"
---

# Create Doc

Create a new Lark document with title `title` and body text `body`. Prefer creating it inside the configured test folder when visible.
