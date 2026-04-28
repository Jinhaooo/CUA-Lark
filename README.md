# CUA-Lark

CUA-Lark is a TypeScript workspace for running computer-use workflows against the Lark/Feishu desktop client.

The current implementation covers the M3a flow: enhanced visual robustness with OCR integration, Action-level VLM verification (pre-action intent check + post-action result validation), benchmark CLI, and improved NL target skill templates.

## Current Status

Implemented (M3a):

- **OCR Bridge Integration**: Python FastAPI server with PaddleOCR/RapidOCR dual-engine support
- **ActionVerifier**: Pre-action intent verification + post-action result validation
- **Visual Robustness**: Fuzzy text matching, OCR-based text location
- **Benchmark CLI**: `cua-lark bench` command for performance baseline measurement
- **NL Target Template**: Three-section prompt template (Goal + Distinctive Description + Completion Criteria)
- **VLM Verification Fix**: Corrected image_url format for proper visual model input
- **Skill-level Action Verification**: Per-skill `verify_actions` frontmatter configuration

Implemented (M2):

- `cua-lark exec <instruction>` CLI command.
- `cua-lark run <glob>` CLI command for YAML test suites.
- Required VLM environment validation.
- Windows and macOS Lark/Feishu process preflight checks.
- UI-TARS `GUIAgent` integration.
- NutJS-based screenshot and action execution through `@ui-tars/operator-nut-js`.
- OpenAI-compatible VLM configuration for `@ui-tars/sdk/core`.
- Skill abstraction with `procedural`, `agent_driven`, and `recorded` kinds.
- IM skills for opening Lark, dismissing popups, searching a target chat, sending a message, and verifying it was sent.
- Config-driven test targets through `configs/test-targets.yaml`.
- JSONL trace output with screenshot attachment support.
- VLM and composite verifier plumbing.
- Workspace build, typecheck, and Vitest test setup.

Not implemented yet:

- Accessibility/CDP locator.
- Planner/LLM orchestration beyond the UI-TARS loop.
- Calendar and Docs workflows.

## Requirements

- Node.js `>=20.0.0`
- pnpm `>=9.0.0`
- Python `>=3.8` (for OCR Bridge)
- Lark or Feishu desktop client installed and running
- A VLM endpoint compatible with the UI-TARS SDK/OpenAI-style API

Enable pnpm through Corepack if needed:

```powershell
corepack enable
corepack prepare pnpm@9.0.0 --activate
```

## Installation

```powershell
pnpm install
pnpm build
```

Install OCR Bridge dependencies (Python):

```powershell
cd packages/ocr-bridge
pip install -r requirements.txt
```

## Configuration

Create `.env` in the repository root. The CLI loads it automatically on startup:

```bash
CUA_VLM_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
CUA_VLM_API_KEY=your-vlm-api-key
CUA_VLM_MODEL=doubao-1.5-vision-pro
```

You can also export the same variables in your shell. Shell environment variables take precedence over `.env` values.

Optional variables reserved for later planner work:

```bash
CUA_LLM_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
CUA_LLM_API_KEY=your-llm-api-key
CUA_LLM_MODEL=doubao-1.5-pro
```

Test targets are configured in `configs/test-targets.yaml`. Test cases should reference target data through config variables instead of hardcoding chat names:

```yaml
im:
  test_group:
    name_pattern: "Your test group"
    expected_member_count: 2
```

Robustness configuration (`configs/robustness.yaml`):

```yaml
action_verify:
  intent_threshold: 0.7
  result_threshold: 0.6
  exempt_action_types:
    - wait
    - finished
    - call_user
    - user_stop
    - hotkey
  default_for_agent_driven: false
```

## Usage

From the repository root:

```powershell
node packages\cli\bin\cua-lark.js exec "open Lark and click the first chat"
```

Run YAML test cases:

```powershell
pnpm build
node packages\cli\bin\cua-lark.js run "testcases/im/*.yaml"
```

Run benchmark:

```powershell
node packages\cli\bin\cua-lark.js bench "testcases/im/*.yaml" --suite m3a --runs 5 --label baseline
```

After packaging or linking the CLI, the intended command is:

```bash
cua-lark exec "open Lark and click the first chat"
cua-lark exec "open Lark" --max-loop 50
cua-lark run "testcases/im/*.yaml"
cua-lark bench "testcases/im/*.yaml" --suite m3a --runs 5 --label baseline
```

## Development

```powershell
pnpm typecheck
pnpm build
pnpm test
```

Run the M2 guard checks:

```powershell
C:\msys64\usr\bin\bash.exe scripts/check-do-not-m2.sh
```

The project is a pnpm workspace:

```text
packages/
  core/
    src/model/       VLM environment and model client helpers
    src/operator/    LarkOperator wrapper over NutJSOperator + ActionVerifier
    src/preflight/   environment and process checks + OCR Bridge health check
    src/skill/       skill definition, registry, and runner
    src/suite/       YAML test loading and suite execution + RobustnessConfigLoader
    src/trace/       JSONL trace writer
    src/verifier/    VLM, OCR, and composite verification
    src/util/        Fuzzy text matching utilities
  skills/
    _common/         shared app/popup skills + PROMPT_TEMPLATE.md
    lark_im/         IM workflow skills (NL target rewritten)
  cli/
    src/commands/    exec, run, and bench commands
  ocr-bridge/        Python FastAPI OCR service
configs/             environment-specific test targets + robustness config
testcases/           YAML workflow test cases
scripts/             M2 guard checks
```

## Action Verification (M3a)

ActionVerifier provides two levels of visual verification:

1. **Pre-action Intent Verification**: Before executing an action, verifies that the target element is uniquely visible in the screenshot
2. **Post-action Result Verification**: After executing an action, compares before/after screenshots to confirm expected UI changes

Exempt action types (no verification): `wait`, `finished`, `call_user`, `user_stop`, `hotkey`

Per-skill configuration via `SKILL.md` frontmatter:

```yaml
verify_actions: true  # Force action verification for this skill
```

## NL Target Template (M3a)

Skills now use a three-section prompt template:

1. **Goal**: What the skill intends to accomplish
2. **Distinctive Description**: Unique identifying features of the target UI
3. **Completion Criteria**: How to determine success

## Exit Codes

| Code | Meaning |
| --- | --- |
| `0` | Command completed successfully |
| `1` | GUIAgent/model/operator execution failed |
| `2` | Preflight failed, such as missing env vars or Lark/Feishu not running |
| `64` | CLI usage error |

## Notes

- The `UI-TARS-Desktop` source tree is only a reference and is not required to run this project.
- Real task execution requires a valid VLM endpoint and a running Lark/Feishu client.
- OCR Bridge runs as a Python subprocess and is automatically started during preflight checks.