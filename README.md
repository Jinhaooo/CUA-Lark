# CUA-Lark

CUA-Lark is a TypeScript workspace for running computer-use workflows against the Lark/Feishu desktop client.

The current implementation covers the M3a flow: enhanced visual robustness with OCR integration, Action-level VLM verification (pre-action intent check + post-action result validation), benchmark CLI, and improved NL target skill templates.

## Current Status

Implemented (M4):

- **HarnessLoop ReAct runtime**: prompt-driven agent loop with structured tool calls, tool whitelisting, loop detection, model request timeout, cancellation, and streaming trace events.
- **ToolRegistry**: shared perceive/act/verify/meta tool surface used by HarnessLoop instead of ad hoc action strings.
- **SQLite trace store**: local SQLite trace database with task rows, event rows, WAL mode, idempotent event writes, and JSONL migration support.
- **Server and dashboard foundation**: Fastify task/trace/SSE API plus dashboard package for task and trace inspection.
- **Real E2E harness script**: `pnpm test:e2e:real -- "<prompt>"` runs a real desktop HarnessLoop task against Lark/Feishu and writes SQLite traces.
- **M4 SQLite smoke test**: `pnpm test:m4:sqlite` verifies server task creation, trace persistence, and trace query flow without controlling the desktop.
- **Prompt CLI backend path**: `cua-lark prompt "<instruction>"` submits prompt tasks through the backend API/SSE path.

Current M4 limitations:

- The server task queue still uses a mock executor; real desktop execution is currently covered by `scripts/test-real-e2e.ts`.
- Calendar, Docs, and complex IM recall flows are being improved through harness engineering rather than adding narrow RPA-style tools.
- Some legacy JSONL trace and SkillRunner code is kept under `_deprecated` for compatibility tests.

Implemented (M3b):

- **SkillPlanner**: Natural language to SkillCall[] conversion with JSON validation and retry
- **IM Procedural Skills**: `search_contact`, `send_message`, `verify_message_sent` rewritten as procedural
- **HybridLocator Integration**: Procedural skills use `ctx.operator.find.byIntent()` for robust element location
- **Fallback Mechanism**: Automatic fallback from procedural to agent_driven when failures occur
- **SideEffects Field**: Skill interface extension for teardown cleanup tracking
- **Failure Injection**: `CUA_FORCE_FAIL` environment variable for fallback testing
- **NL Test Cases**: Instruction-based YAML test cases with backward compatibility

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

- Full server-side wiring from `TaskQueue` to the real desktop `HarnessLoop`.
- Production-grade dashboard workflow controls.

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

Submit a single prompt through the M4 backend path:

```powershell
node packages\cli\bin\cua-lark.js prompt "打开 CUA-Lark-Test 群，但不要发送消息" --max-iterations 20
```

Run the local M4 SQLite smoke test:

```powershell
pnpm test:m4:sqlite
```

Run a real desktop end-to-end HarnessLoop task:

```powershell
pnpm test:e2e:real -- "打开 CUA-Lark-Test 群，然后发送 Hello 消息，发送成功后撤回这条消息。" --max-iterations 35 --model-timeout-ms 60000
```

The real E2E script writes traces to SQLite. Use `--db-path ./traces/<name>.db` to choose a trace database. Press `ESC` to request cancellation.

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
    src/harness/     Prompt-driven HarnessLoop runtime
    src/model/       VLM environment and model client helpers
    src/operator/    LarkOperator wrapper over NutJSOperator + ActionVerifier
    src/preflight/   environment and process checks + OCR Bridge health check
    src/skill/       skill definition, registry, and runner
    src/suite/       YAML test loading and suite execution + RobustnessConfigLoader
    src/tools/       ToolRegistry and perceive/act/verify/meta tools
    src/trace/       SQLite trace store, EventBus, and TracePersister
    src/verifier/    VLM, OCR, and composite verification
    src/util/        Fuzzy text matching utilities
  server/            Fastify task, trace, SSE, and skill APIs
  dashboard/         Frontend dashboard foundation
  skills/
    _common/         shared app/popup skills + PROMPT_TEMPLATE.md
    lark_im/         IM workflow skills (NL target rewritten)
  cli/
    src/commands/    exec, run, bench, prompt, and verification commands
  uia-bridge/        Windows UI Automation bridge
  ocr-bridge/        Python FastAPI OCR service
configs/             environment-specific test targets + robustness config
testcases/           YAML workflow test cases
scripts/             guard checks, trace migration, smoke tests, and real E2E scripts
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

## NL 用例写法 (M3b)

测试用例支持两种写法：

**1. 传统写法（skillCalls）：**
```yaml
id: im_02_send_text
title: 搜索目标会话并发送文本消息
skillCalls:
  - skill: lark_im.search_contact
    params:
      name_pattern: ${config:im.test_group.name_pattern}
  - skill: lark_im.send_message
    params:
      text: "测试消息"
```

**2. 自然语言写法（instruction）：**
```yaml
id: im_02_send_text
title: 搜索目标会话并发送文本消息
instruction: "在飞书 IM 中搜索 ${config:im.test_group.name_pattern}，打开会话，发送文本'测试消息'"
```

当使用 `instruction` 字段时，SkillPlanner 会自动将自然语言转换为对应的 SkillCall 序列。

## Planner 行为 (M3b)

SkillPlanner 负责将自然语言指令转换为可执行的技能调用序列：

- **输入**: 自然语言指令 + 可用技能清单
- **输出**: SkillCall[] 数组（最多10条）
- **重试机制**: 首次输出非法JSON时，自动重试1次
- **技能选择**: 基于技能的 `description` 和 `params` 进行匹配

## Procedural vs Agent-Driven (M3b)

| 维度 | Procedural | Agent-Driven |
| --- | --- | --- |
| **执行方式** | 硬编码步骤序列 | VLM推理决策 |
| **速度** | 毫秒级（快5-10倍） | 秒级 |
| **Token消耗** | 低（< 500/skill） | 高（3000-8000/skill） |
| **验证方式** | UIA + OCR | VLM + OCR |
| **适用场景** | 高频核心路径 | 长尾场景、fallback |

**Fallback 机制**: 当 procedural skill 失败时，自动 fallback 到 agent_driven 版本，确保任务可完成。

## sideEffects 字段 (M3b)

Skill 接口新增 `sideEffects` 字段，用于描述技能执行产生的副作用，为 M3c 的 teardown 清理做准备：

```typescript
interface SideEffectSpec {
  im?: {
    sentMessages?: {
      chatPattern: string;      // 会话标识模板
      contentPattern: string;   // 消息内容模板
      withinMs?: number;       // 时间范围
    };
  };
  calendar?: { /* ... */ };
  docs?: { /* ... */ };
}
```

示例：
```typescript
sideEffects: {
  im: {
    sentMessages: {
      chatPattern: '${ctx.snapshot.imChatTitle}',
      contentPattern: '${params.text}',
      withinMs: 86400000,
    },
  },
}
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
- Real task execution requires a valid VLM endpoint and a running Lark/Feishu client.
- OCR Bridge runs as a Python subprocess and is automatically started during preflight checks.
