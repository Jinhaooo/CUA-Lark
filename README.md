# CUA-Lark

CUA-Lark is a TypeScript workspace for running computer-use workflows against the Lark/Feishu desktop client.

The current implementation covers the M2 flow: a CLI can run YAML test cases, execute registered skills, write JSONL traces, and verify outcomes through a VLM-backed verifier. The lower-level `exec` command is still available for direct UI-TARS driven tasks.

## Current Status

Implemented:

- `cua-lark exec <instruction>` CLI command.
- `cua-lark run <glob>` CLI command for YAML test suites.
- Required VLM environment validation.
- Windows and macOS Lark/Feishu process preflight checks.
- UI-TARS `GUIAgent` integration.
- NutJS-based screenshot and action execution through `@ui-tars/operator-nut-js`.
- OpenAI-compatible VLM configuration for `@ui-tars/sdk/core`.
- Skill abstraction with `procedural`, `agent_driven`, and `recorded` kinds.
- M2 IM skills for opening Lark, dismissing popups, searching a target chat, sending a message, and verifying it was sent.
- Config-driven test targets through `configs/test-targets.yaml`.
- JSONL trace output with screenshot attachment support.
- VLM and composite verifier plumbing.
- Workspace build, typecheck, and Vitest test setup.

Not implemented yet:

- OCR text locator.
- Accessibility/CDP locator.
- Planner/LLM orchestration beyond the UI-TARS loop.
- Calendar and Docs workflows.

## Requirements

- Node.js `>=20.0.0`
- pnpm `>=9.0.0`
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

## Usage

From the repository root:

```powershell
node packages\cli\bin\cua-lark.js exec "open Lark and click the first chat"
```

Run M2 YAML test cases:

```powershell
pnpm build
node packages\cli\bin\cua-lark.js run "testcases/im/*.yaml"
```

After packaging or linking the CLI, the intended command is:

```bash
cua-lark exec "open Lark and click the first chat"
cua-lark exec "open Lark" --max-loop 50
cua-lark run "testcases/im/*.yaml"
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
    src/operator/    LarkOperator wrapper over NutJSOperator
    src/preflight/   environment and process checks
    src/skill/       skill definition, registry, and runner
    src/suite/       YAML test loading and suite execution
    src/trace/       JSONL trace writer
    src/verifier/    VLM and composite verification
  skills/
    _common/         shared app/popup skills
    lark_im/         IM workflow skills
  cli/
    src/commands/    exec and run commands
configs/             environment-specific test targets
testcases/           YAML workflow test cases
scripts/             M2 guard checks
```

## Exit Codes

| Code | Meaning |
| --- | --- |
| `0` | Command completed successfully |
| `1` | GUIAgent/model/operator execution failed |
| `2` | Preflight failed, such as missing env vars or Lark/Feishu not running |
| `64` | CLI usage error |

## Notes

- The `UI-TARS-Desktop` source tree is only a reference and is not required to run this project.
- The current Windows smoke test reaches the GUIAgent path, captures a screenshot, and attempts a model call when VLM variables are present.
- Real task execution requires a valid VLM endpoint and a running Lark/Feishu client.
