---
name: lark_calendar.create_event
kind: agent_driven
description: Create a Lark calendar event.
verify_actions: true
params_schema:
  title: string
  time_hint: string
verifyDifficulty:
  uia: medium
  ocr: medium
  vlm: low
sideEffects:
  calendar:
    createdEvents:
      titlePattern: "${params.title}"
      timeRangeRef: "${params.time_hint}"
---

# Create Event

Create a calendar event with title `title` and time hint `time_hint`. Save the event and finish only after the event is visible or the UI clearly confirms creation.
