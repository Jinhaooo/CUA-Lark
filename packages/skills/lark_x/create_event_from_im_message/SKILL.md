---
name: lark_x.create_event_from_im_message
kind: agent_driven
description: Extract event details from an IM message and create a calendar event in Lark Calendar.
verify_actions: true
params_schema:
  messagePattern: string
  eventTitle: string
  eventTime: string
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

# Create Event from IM Message

Find a message containing meeting/event information in Lark IM and create a corresponding calendar event.

## Task Objective

1. Search for and locate the message matching `messagePattern` in Lark IM
2. Read and extract event details from the message (title, time, participants if visible)
3. Open Lark Calendar
4. Create a new event using `eventTitle` and `eventTime` as the primary details
5. Verify the event was created successfully

## Task Objective

When you receive a message that mentions a meeting or event:
1. Locate the message in the IM chat using OCR or UI automation
2. Read the message content to extract event details (title, date, time)
3. Navigate to Lark Calendar
4. Create a new event using the extracted details
5. Use `eventTitle` and `eventTime` as provided

## Completion Criteria

- The message containing the event information is found and read
- A new calendar event is created with the correct title and time
- The event appears in Lark Calendar with "Busy" status

## Tool Usage Suggestions

- Use `ocr_locate` or `uia_find` to locate the target message
- Use `ocr_read` or `vlm_locate` to extract text content from the message
- Use `_common/wait_for_loading` before creating the event
- Use `record_evidence` to capture the source message before creating the event

## Common Pitfalls

- Messages with meeting details may be embedded in cards, images, or formatted text
- OCR may struggle with complex layouts - try multiple verification strategies
- Event times may be in relative format ("next Monday at 3pm") - interpret correctly
- The Calendar app may require clicking a specific date to reveal the "Create Event" button
- Cross-product navigation (IM → Calendar) is error-prone - verify state at each step
