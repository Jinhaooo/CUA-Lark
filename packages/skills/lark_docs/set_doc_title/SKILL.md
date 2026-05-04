---
name: lark_docs.set_doc_title
kind: agent_driven
description: Set the title of the currently open Lark document.
verify_actions: true
params_schema:
  title: string
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

# Set Doc Title

Set the current Lark document title to `title`. Finish when the title is visible in the document header.
