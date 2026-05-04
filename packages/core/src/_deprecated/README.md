# _deprecated Directory

This directory contains deprecated code from the v1.3 Harness architecture refactoring.

**Contents:**
- Legacy implementations that have been replaced by the ToolRegistry/HarnessLoop paradigm
- Old Skill implementations (procedural.ts, agent_driven.ts)
- Deprecated modules: HybridLocator, SkillRunner, Reflector, ActionVerifier, StagedVerifier, CompositeVerifier

**Important:**
- This directory is excluded from build and test
- Code here is for reference only
- Do NOT import from this directory
- Do NOT modify files here - they are preserved for historical reference only

**Deprecation Reasons (v1.3):**
1. **HybridLocator**: Disassembled into separate tools (uia_find, ocr_locate, vlm_locate) that VLM explicitly calls
2. **SkillRunner**: Replaced by HarnessLoop ReAct main loop
3. **ActionVerifier**: VLM now performs verification autonomously via verify_* tools
4. **StagedVerifier/CompositeVerifier**: VLM composes verification strategies dynamically
5. **procedural/agent_driven skills**: Replaced by declarative SKILL.md templates