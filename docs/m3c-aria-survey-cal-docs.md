# M3c ARIA Survey: Calendar and Docs

Status: pending real GUI inspection.

This file records the Calendar/Docs UIA findings required by `plans/M3c-Implementation-Plan.md`.

## Calendar

| Element | Preferred locator | Observed status | Risk |
|---|---|---|---|
| Calendar entry | `Button` name containing Calendar/日历 | pending | icon-only names may be empty |
| New event | `Button` name containing New/新建 | pending | medium |
| Event title field | `Edit` near event dialog title | pending | medium |
| Time field | direct text entry preferred | pending | high |
| Save button | `Button` name containing Save/保存/确定 | pending | medium |

## Docs

| Element | Preferred locator | Observed status | Risk |
|---|---|---|---|
| Docs entry | `Button` or app switcher item | pending | medium |
| New document | `Button`/`MenuItem` name containing New/新建/文档 | pending | medium |
| Title field | document header edit target | pending | medium |
| Body editor | OCR/VLM only | pending | high, canvas-rendered |
| Test folder | configured folder name | pending | medium |
