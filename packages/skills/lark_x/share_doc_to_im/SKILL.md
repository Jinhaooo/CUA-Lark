---
name: lark_x.share_doc_to_im
kind: agent_driven
description: Open a Lark Docs document and share it to a Lark IM chat.
verify_actions: true
params_schema:
  docTitle: string
  chatName: string
verifyDifficulty:
  uia: high
  ocr: medium
  vlm: low
maxLoopIterations: 40
sideEffects:
  - sentMessages: true
  - createdEvents: false
  - createdDocs: false
toolWhitelist:
  - screenshot
  - uia_find
  - uia_find_all
  - ocr_locate
  - ocr_read
  - vlm_locate
  - read_state
  - click
  - double_click
  - right_click
  - type
  - hotkey
  - scroll
  - drag
  - wait
  - wait_until
  - wait_for_loading
  - verify_vlm
  - verify_ocr
  - verify_pixel
  - verify_a11y
  - finished
  - record_evidence
---

# Share Doc to IM

Open a Lark Docs document and share it to a Lark IM chat or contact.

## Task Objective

1. Open Lark Docs from the app launcher
2. Search for and open the document with title matching `docTitle`
3. Find the "Share" or "Send" action in the Docs toolbar
4. Select a chat or contact matching `chatName` as the recipient
5. Confirm the share action

## Completion Criteria

- The document is visible and readable
- A share confirmation message appears in the target IM chat
- The message in IM contains a link or reference to the shared document

## Tool Usage Suggestions

- Use `ocr_locate` or `vlm_locate` to find the document in the Docs list
- Use `ocr_read` to read document titles and search results
- Use `_common/wait_for_loading` after opening the document
- Use `record_evidence` to capture the share action confirmation

## Common Pitfalls

- Documents may be in a nested folder structure - use search functionality
- Sharing may require selecting the chat from a contact picker modal
- Some documents may have restricted sharing permissions
- Cross-product navigation (Docs → IM) requires careful state tracking
- The share button location varies between document types (Docs vs Sheets vs Slides)
