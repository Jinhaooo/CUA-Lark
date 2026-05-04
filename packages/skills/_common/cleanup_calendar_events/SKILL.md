---
name: _common.cleanup_calendar_events
kind: agent_driven
description: Delete test calendar events by title prefix.
verify_actions: true
params_schema:
  titlePrefix: string
verifyDifficulty:
  uia: high
  ocr: medium
  vlm: low
---

# Cleanup Calendar Events

Use the Calendar GUI to find and delete events whose titles start with `titlePrefix`. Use only GUI operations.
