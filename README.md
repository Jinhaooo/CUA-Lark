# CUA-Lark

CUA-Lark is a TypeScript workspace for running a computer-use agent against the Lark/Feishu desktop client.

The current implementation provides a working CLI entrypoint, environment preflight checks, and integration with the UI-TARS SDK plus NutJS desktop operator. It is an early M1 implementation focused on proving that `cua-lark exec` can load, capture the screen, call a configured vision model, and execute parsed GUI actions.

## Current Status

Implemented:

- `cua-lark exec <instruction>` CLI command.
- Required VLM environment validation.
- Windows and macOS Lark/Feishu process preflight checks.
- UI-TARS `GUIAgent` integration.
- NutJS-based screenshot and action execution through `@ui-tars/operator-nut-js`.
- OpenAI-compatible VLM configuration for `@ui-tars/sdk/core`.
- Workspace build, typecheck, and Vitest test setup.

Not implemented yet:

- OCR text locator.
- Accessibility/CDP locator.
- Higher-level Lark workflow skills.
- Planner/LLM orchestration beyond the UI-TARS loop.

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

Create `.env` or export these variables in your shell:

```bash
CUA_VLM_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
CUA_VLM_API_KEY=your-vlm-api-key
CUA_VLM_MODEL=doubao-1.5-vision-pro
```

Optional variables reserved for later planner work:

```bash
CUA_LLM_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
CUA_LLM_API_KEY=your-llm-api-key
CUA_LLM_MODEL=doubao-1.5-pro
```

## Usage

From the repository root:

```powershell
node packages\cli\bin\cua-lark.js exec "open Lark and click the first chat"
```

After packaging or linking the CLI, the intended command is:

```bash
cua-lark exec "open Lark and click the first chat"
cua-lark exec "open Lark" --max-loop 50
```

## Development

```powershell
pnpm typecheck
pnpm build
pnpm test
```

The project is a pnpm workspace:

```text
packages/
  core/
    src/model/       VLM environment and model client helpers
    src/operator/    LarkOperator wrapper over NutJSOperator
    src/preflight/   environment and process checks
  cli/
    src/commands/    exec command
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
