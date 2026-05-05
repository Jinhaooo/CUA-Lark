---
name: lark_x.handle_calendar_invite_in_im
kind: agent_driven
description: Handle a calendar invite received in Lark IM and accept/decline it, verifying the event is added to calendar.
verify_actions: true
params_schema:
  inviteType: string
verifyDifficulty:
  uia: high
  ocr: medium
  vlm: low
maxLoopIterations: 40
sideEffects:
  - sentMessages: false
  - createdEvents: true
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

# Handle Calendar Invite in IM

Handle an incoming calendar invitation card in Lark IM. Click the invite card to view details, then accept or decline based on `inviteType`.

## Task Objective

When you receive a calendar invite notification in IM:
1. Locate and click the calendar invite card in the message list
2. View the event details
3. Accept or decline the invitation based on `inviteType` ("accept" or "decline")
4. Verify the event was added to or removed from your calendar

## Completion Criteria

- If `inviteType` is "accept": The event appears in your Lark Calendar with "Accepted" status
- If `inviteType` is "decline": The event does not appear or shows "Declined" status
- Use `record_evidence` to capture the invite card details before clicking

## Tool Usage Suggestions

- Use `ocr_locate` or `vlm_locate` to find the calendar invite card in the message list
- Use `wait_for_loading` after clicking to wait for Calendar view to load
- Use `verify_ocr` or `verify_vlm` to confirm the event status in Calendar

## Common Pitfalls

- Calendar invite cards may appear as expandable cards - scroll to find them
- Accepting/declining may trigger a confirmation dialog - use `_common/dismiss_popup` if needed
- After accepting, the Calendar view may need a moment to update - use `wait_for_loading`
- Cross-product navigation (IM → Calendar) may require waiting for the new view to fully load
