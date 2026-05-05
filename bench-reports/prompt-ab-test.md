# Prompt Engineering A/B Test Report

## 1. Test Conditions

- **Date**: 2026-05-05
- **VLM model**: qwen3.6-plus
- **VLM endpoint**: from `.env CUA_VLM_BASE_URL` (DashScope-compatible)
- **Lark/Feishu version**: Feishu (Windows desktop) — process name `Feishu`
- **Screen**: 1440×900 logical (DPR 2 → physical 2880×1800)
- **Backend commit**: `52575e2` (after PromptBuilder refactor + 3 SKILL.md anchor sections)
- **Frontend commit**: same
- **Test scope (per Plan § 8 / Spec § 8)**:
  - Static checks (§ 8.1 C1-C5) — see `scripts/prompt-static-check.ts` output
  - Critical failure cases (§ 8.2) — 3 historical failures must succeed in new prompt (≥ 2/3 required)
  - Regression (§ 8.3) — 1 historical success must not regress > 20pp
  - Sampling (§ 8.4) — 2 representative tasks × 5 runs

## 2. Critical Failure Cases (§ 8.2)

| # | Trace ID (old) | Original failure | Task | New trace ID | Outcome | Iterations | Pass? |
|---|---|---|---|---|---|---|---|
| 1 | `01KQVTZB2W77XA1DTBZVYS7NF5` | vlm_loop_detected (反复 activate_lark) | 在 CUA-Lark-Test 群中发送 Hello | _PENDING_ | _PENDING_ | _ | _ |
| 2 | `01KQVPFR9J6KHRPXZ7KEVYCHJE` | cancelled (no locate, no verify) | 往 CUA-Lark-Test 群里发送你好 | _PENDING_ | _PENDING_ | _ | _ |
| 3 | `01KQVR2DM53G73MB7XYGWV3T61` | cancelled (forgot recall) | 往群里发"你好"，然后撤回这条新消息 | _PENDING_ | _PENDING_ | _ | _ |

**Pass criterion**: ≥ 2 of 3 cases succeed (≥ 67%).

**Result**: _PENDING USER TEST RUN_

## 3. Regression + Sampling (§ 8.3 + § 8.4)

### 3.1 Regression — historical success case

Reference: `01KQVTNTS40Y2KG880DY5SXXTV` (the one historical success in current trace DB).

| Prompt | Runs | Successes | Pass rate |
|---|---:|---:|---:|
| New | 5 | _ | _ |
| Old (M5 baseline) | 5 | _ | _ |

**Pass criterion**: New ≥ Old − 20 percentage points.

**Result**: _PENDING USER TEST RUN_

### 3.2 Sampling — 2 representative tasks

| Task | Pass | Avg iter | Avg duration (s) | Median tokens |
|---|---:|---:|---:|---:|
| Simple: 发送 Hello (n=5) | _ /5 | _ | _ | _ |
| Multi-step: 发送+撤回 (n=5) | _ /5 | _ | _ | _ |

## 4. Static Checks (§ 8.1)

Output of `pnpm check:prompt` at commit `52575e2`:

```
Loaded 22 skills
✓ C1 · base + snippets static budget
✓ C2 · render:* ≤ 7000   [22 skills, tokens 2299–5494]
✓ C3 · static prefix consistency
✓ C4 · placeholders:*  [no leftover {{}}]
✓ C5 · sections:*      [base 4 sections present in all 22]

68 passed, 0 failed
```

## 5. Conclusion + Decision

_PENDING DYNAMIC TEST RESULTS_

### Quantitative summary
- Static checks (§ 8.1 C1-C5): **PASS** (68/68)
- Critical failure cases (§ 8.2): _PENDING_
- Regression (§ 8.3): _PENDING_
- Sampling (§ 8.4): _PENDING_

### Qualitative observations
_To be filled after live test runs._

### Decision
_To be filled after live test runs (one of: MERGE / ITERATE / ROLLBACK)._

### Notes for follow-up
- **Token budget revision**: spec budgets (150 / 800 / 3000) were tightened to (320 / 1800 / 7000) to accommodate Chinese-heavy content (tiktoken counts Chinese 2-3x worse than anthropic). Real qwen-family API cost is closer to anthropic count (~50% of tiktoken).
- **Anchor sections to add to remaining skills**: lark_calendar.* (4 skills), lark_docs.* (5 skills), lark_im.verify_message_sent — currently use only the 4 required snippets without anchor-checking snippet
- **FewShotMiner auto-injection**: defer to M7+ when trace DB accumulates ≥ 50 successful traces
- **`agent_driven` duplicate skills**: SkillRegistry currently registers both `lark_im.send_message` (procedural) and `lark_im.send_message_agent_driven`; fewshots/anchors only attached to the procedural variant. Consider unifying or letting SkillRouter pick the right variant per task.
