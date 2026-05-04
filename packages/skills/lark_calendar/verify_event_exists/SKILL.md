---
name: lark_calendar.verify_event_exists
kind: agent_driven
description: Verify that a Lark calendar event is visible.
verify_actions: true
params_schema:
  title: string
verifyDifficulty:
  uia: medium
  ocr: medium
  vlm: low
---

# Verify Event Exists

Verify that an event whose title contains `title` is visible in Calendar.
