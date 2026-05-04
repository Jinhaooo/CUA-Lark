# _deprecated Directory

This directory contains deprecated skill implementations from the v1.3 Harness architecture refactoring.

**Contents:**
- Old skill implementations (procedural.ts, agent_driven.ts)
- Legacy verify_* skills that are no longer needed

**Important:**
- This directory is excluded from build and test
- Code here is for reference only
- Do NOT import from this directory

**Deprecation Reasons (v1.3):**
1. All skills are now declarative SKILL.md templates instead of executable code
2. VLM performs verification autonomously via verify_* tools in the ToolRegistry
3. verify_message_sent, verify_event_exists, verify_doc_exists are no longer needed as separate skills