---
name: lark_docs.insert_text
kind: agent_driven
description: Insert body text into the currently open Lark document.
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
      maxDurationMs: 1200
    - name: expensive
      spec:
        kind: vlm
        prompt: "Verify that the current document body contains '${params.text}'."
      maxDurationMs: 3000
---

# Insert Text

Insert `text` into the body of the currently open Lark document. The editor body may be canvas-rendered, so rely on visible text and VLM/OCR verification.
