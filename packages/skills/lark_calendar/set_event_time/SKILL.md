---
name: lark_calendar.set_event_time
kind: agent_driven
description: Set the time of the currently edited or selected calendar event.
verify_actions: true
params_schema:
  title: string
  time_hint: string
verifyDifficulty:
  uia: medium
  ocr: medium
  vlm: low
---

# Set Event Time

Find the calendar event identified by `title`, open its editor if needed, set its time using `time_hint`, and save it.

Prefer typing the time text directly into the time field. Avoid using a visual date picker unless text entry is unavailable.
