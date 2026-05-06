# CUA-Lark

> English · [中文](./README.zh-CN.md)

CUA-Lark is a TypeScript workspace for running computer-use agents against the Lark / Feishu desktop client. The agent perceives the screen with a VLM, plans the next action through a ReAct prompt loop, and executes desktop actions via NutJS-based operators with optional UIA / OCR fallbacks. Risky operations route through a confirmation gate before execution.

## Highlights

- **Prompt-driven ReAct runtime (`HarnessLoop`)** — Chinese system prompts built dynamically from the live tool registry, JSON tool-call output with retry-nudge correction, tool-name normalization (e.g. `stop` / `done` / `complete` → `finished`), pre-execution abort checks, and SSE-friendly trace events (thought streaming, iteration markers, task lifecycle).
- **ToolRegistry with whitelisting** — perceive (`screenshot`, `ocr_locate`, `wait_for_loading`), act (`click`, `type`, `hotkey`, `scroll`, …), verify (`failure_analyst`, `risk_classifier`), and meta (`ASK_USER`, `record_evidence`, `finished`). The system prompt enumerates only whitelisted tools, and the loop refuses unknown tool names with a corrective observation listing the actual whitelist.
- **Risk gate** — destructive tool calls (`delete_*`, `dismiss_group`, `clear_recall`, …) and high-risk keyword matches are intercepted before execution. The gate emits a `risk_confirmation_required` event, then suspends the loop until the operator/dashboard responds via `POST /tasks/:id/confirm`. Levels and keyword lists live in `configs/risk-gate.yaml`.
- **Self-healing executor** — on hard failure, `failure_analyst` produces a structured root-cause + alternative strategy; `SelfHealingExecutor` decides (by confidence + reason whitelist) whether to re-enter the loop with the new strategy or surface the failure.
- **Curation data layer** — `EmbeddingClient`, `FewShotMiner`, `FailureClusterer` mine successful traces into few-shot examples and cluster failures by error kind. Exposed via `/curation/*` HTTP routes and the dashboard.
- **SQLite trace store** — task rows + event rows, WAL mode, idempotent event writes, JSONL migration helpers. The Fastify server exposes task / trace / SSE APIs; the dashboard package consumes them for inspection, failure triage, and few-shot review.
- **Skill library** — shared `_common` (popup dismissal, permission-denied handling), `lark_im` (search contact, send message, verify sent), `lark_calendar` (create event), `lark_docs`, and exploratory `lark_x` cross-app skills. Procedural skills with agent-driven fallback are still supported, but the harness can also drive raw NL tasks against the tool registry directly.
- **Electron frontend (Path B)** — a vendored UI-TARS-desktop fork now lives at `frontend/` and talks to `packages/server` over SSE. Global ESC shortcut aborts the active task; risk confirmations and running-task indicators are wired through the shared zustand store. The frontend has its own pnpm workspace (`frontend/pnpm-workspace.yaml`), so install / build it separately from the backend.

## Repository Layout

```text
packages/
  core/
    src/harness/      HarnessLoop, PromptBuilder, SelfHealingExecutor
    src/model/        VLM/LLM clients, streaming, HTTP resilience
    src/operator/     LarkOperator wrapper over NutJSOperator + ActionVerifier
    src/preflight/    env / process / OCR-bridge health checks
    src/skill/        skill definition, registry, runner
    src/suite/        YAML test loading + suite execution
    src/tools/        ToolRegistry, RiskGate, perceive / act / verify / meta tools
    src/trace/        SQLite TraceStore, EventBus, TracePersister
    src/data/         EmbeddingClient, FewShotMiner, FailureClusterer
    src/verifier/     VLM, OCR, composite verifiers
    src/util/         fuzzy matching, helpers
  server/             Fastify task / trace / SSE / skill / confirm / curation routes
  dashboard/          Frontend dashboard (FailureClustering, FewShotCuration, RiskConfirmDialog, …)
  skills/
    _common/          popup dismissal, permission denied, …
    lark_im/          IM workflow skills
    lark_calendar/    calendar skills
    lark_docs/        docs skills
    lark_x/           cross-app exploratory skills
  cli/                exec / run / bench / prompt commands
  uia-bridge/         Windows UI Automation bridge
  ocr-bridge/         Python FastAPI OCR service (PaddleOCR / RapidOCR)
frontend/             Electron app (vendored UI-TARS-desktop fork, separate pnpm workspace)
  main/               Electron main process (escapeStop, runAgent, windowManager, …)
  preload/            preload bridge
  renderer/           React UI (RunMessages, useRunAgent, settings, …)
configs/              harness, robustness, risk-gate, server, test-targets, vlm-upgrade
testcases/            YAML workflow test cases
scripts/              guard checks, trace migration, smoke tests, real E2E
```

## Requirements

- Node.js `>=20.0.0`
- pnpm `>=9.0.0`
- Python `>=3.8` (for the OCR bridge)
- Lark or Feishu desktop client installed and running
- A VLM endpoint compatible with the UI-TARS SDK / OpenAI-style API

### Enable a11y for UIA (Windows, optional but recommended)

Lark/飞书 桌面客户端是 Electron 应用，默认**不向 Windows UI Automation 暴露内部控件树**。在 a11y 启用前，`uia_find` / `uia_find_all` / `verify_a11y` 三个工具拿不到任何控件——所以服务器启动时会探测 a11y 状态，若未启用则**自动从 agent 的工具白名单里剔除这三个工具**，避免 agent 浪费迭代尝试它们。

要解锁 UIA 路径，**在第一次启动飞书前**做一次：

1. `Win + Ctrl + Enter` 打开 Windows 旁白（Narrator），让它说几秒话
2. 再次 `Win + Ctrl + Enter` 关闭旁白
3. **重启飞书**
4. 重启 cua-lark 后端，看启动日志：

```
[server] UiaClient initialized: enabled=true nodeCount=328
```

`enabled=true` 表示 UIA 树已展开（约 328 个节点、47 个 Button、12 个 Edit），UIA 工具自动重新启用。该 a11y 状态系统级持久化，**之后即使关闭旁白、重启飞书、重启电脑都仍生效**——只需做一次。

不做这一步也能用，OCR + VLM 已覆盖所有定位场景，只是少了一条更快更精确的降级链。

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

OCR bridge (Python):

```powershell
cd packages/ocr-bridge
pip install -r requirements.txt
```

## Configuration

Create `.env` in the repository root. The CLI / server load it automatically:

```bash
CUA_VLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
CUA_VLM_API_KEY=your-vlm-api-key
CUA_VLM_MODEL=qwen3.6-plus

# Optional planner / failure-analyst LLM
CUA_LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
CUA_LLM_API_KEY=your-llm-api-key
CUA_LLM_MODEL=qwen3.6-plus
```

Shell environment variables override `.env`.

Key config files under `configs/`:

| File | Purpose |
| --- | --- |
| `harness.yaml` | HarnessLoop defaults (max iterations, model timeout, …) |
| `robustness.yaml` | ActionVerifier thresholds and exemptions |
| `risk-gate.yaml` | Destructive-tool list, risk keywords, level→policy mapping |
| `server.yaml` | Fastify port, CORS, auth |
| `test-targets.yaml` | Per-environment test target data (group names, …) |

## Usage

### CLI

Run a single natural-language prompt against Lark / Feishu:

```powershell
node packages\cli\bin\cua-lark.js exec "打开 CUA-Lark-Test 群，发送 Hello"
```

Run YAML test cases:

```powershell
node packages\cli\bin\cua-lark.js run "testcases/im/*.yaml"
```

Submit a prompt through the backend (creates a task row + SSE stream):

```powershell
node packages\cli\bin\cua-lark.js prompt "打开 CUA-Lark-Test 群，但不要发送消息" --max-iterations 20
```

Real desktop end-to-end run:

```powershell
pnpm test:e2e:real -- "打开 CUA-Lark-Test 群，发送 Hello，然后撤回这条消息" --max-iterations 35 --model-timeout-ms 60000
```

Press `ESC` to request cancellation. Use `--db-path ./traces/<name>.db` to choose a trace database.

### Server + Dashboard

Start the Fastify backend:

```powershell
pnpm --filter @cua-lark/server dev
```

The server listens on `http://127.0.0.1:7878` by default. Endpoints:

- `POST /tasks` — create a task (HarnessLoop run).
- `GET  /tasks/:id` / `GET /tasks` — task metadata.
- `GET  /tasks/:id/events` — SSE stream of trace events (thought chunks, tool calls, observations, status).
- `POST /tasks/:id/confirm` — respond to a risk-confirmation prompt (`{ confirmed: boolean, reason?: string }`).
- `GET  /curation/failures`, `POST /curation/failures` — failure clustering / few-shot mining.

The dashboard package consumes these APIs:

```powershell
pnpm --filter @cua-lark/dashboard dev
```

### Electron frontend

The Electron app under `frontend/` (vendored from UI-TARS-desktop) connects to the same backend over SSE. It registers a global ESC shortcut so the agent can be aborted even while it has window focus, and surfaces a "running" indicator with the current step / action / elapsed time.

The frontend is a separate pnpm workspace, so install and run it independently of the backend:

```powershell
cd frontend
pnpm install
pnpm dev
```

With the backend running on `127.0.0.1:7878` and the Electron window open, the chat input drives a HarnessLoop run; the renderer subscribes to the SSE stream and renders thought chunks, tool calls, and observations live.

## ReAct Loop Design Notes

- **Prompt construction**: `PromptBuilder` builds the system prompt from the live tool registry. Every prompt explicitly enumerates the whitelisted tool names and includes a worked `finished` example (`{"thought":"…","tool_call":{"name":"finished","args":{"success":true,"reason":"…"}}}`).
- **Tool-name normalization**: aliases like `left_click`, `take_screenshot`, `press_key`, `done`, `task_complete`, `stop`, … are mapped onto canonical tool names before lookup. Unknown names produce a Chinese corrective observation listing the actual whitelist.
- **Retry nudge**: when the model emits non-JSON, the next request appends a Chinese user message reminding the model of the schema and offering the `finished` shape if it believes the task is done.
- **Cancellation**: the loop checks `signal.aborted` immediately before each tool execution, so an ESC / stop event between "model returned" and "tool runs" prevents stale clicks.
- **Risk gate**: destructive or high-risk tool calls suspend the loop with a `risk_confirmation_required` event. The dashboard / Electron UI presents a confirmation; the loop resumes when `/tasks/:id/confirm` arrives, or aborts on timeout.
- **Self-healing**: on terminal failure, `failure_analyst` produces `{ errorKind, rootCause, alternativeStrategy, confidence }`. `SelfHealingExecutor` re-enters the loop with the alternative strategy when confidence ≥ threshold and the reason isn't on the unretryable list (`permission_denied`, `risk_denied`, `max_iterations_reached`, `budget_exceeded`, `tool_call_parse_failed`).

## Development

```powershell
pnpm typecheck
pnpm build
pnpm test
```

Run M2 guard checks:

```powershell
C:\msys64\usr\bin\bash.exe scripts/check-do-not-m2.sh
```

## Prompt Engineering

The HarnessLoop's system prompt is composed by `PromptBuilder` from:

- `packages/core/src/harness/prompts/base.system.md` — XML-tagged 4-section thought (`observation` / `analysis` / `plan` / `action`) + tool contract
- `packages/core/src/harness/prompts/snippets/*.md` — 6 reusable snippets (4 required, 2 conditional)
  - **Required**: `state-diff-reasoning` / `tool-selection-heuristics` / `loop-prevention` / `finished-criteria`
  - **Conditional**: `anchor-checking` (when SKILL.md has `## 锚点状态` section), `lark-window-discipline` (when skill name starts with `lark_`)
- Per-skill `SKILL.md` body — task description / completion criteria / anchors / common pitfalls (parsed by `parseSkillBody`)
- Per-skill `few-shots/*.md` — handcrafted execution traces, wrapped in `<example>` tags

**Token budget** (max of @anthropic-ai/tokenizer + js-tiktoken counts):
- base ≤ 1000 tk · single snippet ≤ 320 tk · skill instance ≤ 800 tk · fewshots ≤ 3500 tk · **total ≤ 7000 tk**
- Static prefix (base + snippets) is constant per skill — prompt-cache friendly
- Budget enforced at construction time + every `build()` call; over-budget throws `PromptBudgetExceeded`

Run static checks:

```powershell
pnpm check:prompt
```

Plan: [`plans/Prompt-Engineering-Implementation-Plan.md`](./plans/Prompt-Engineering-Implementation-Plan.md) (spec) + [`plans/Prompt-Engineering-Tasks.md`](./plans/Prompt-Engineering-Tasks.md) (TDD task list).

A/B report: [`bench-reports/prompt-ab-test.md`](./bench-reports/prompt-ab-test.md).

## Exit Codes

| Code | Meaning |
| --- | --- |
| `0` | Command completed successfully |
| `1` | Agent / model / operator execution failed |
| `2` | Preflight failed (missing env vars, Lark / Feishu not running, …) |
| `64` | CLI usage error |

## Notes

- The `UI-TARS-Desktop` source tree at the parent level is a reference vendor drop and is not required to run this project.
- Real task execution requires a valid VLM endpoint and a running Lark / Feishu client.
- The OCR bridge runs as a Python subprocess and is started automatically during preflight.
- `runs/`, `traces/`, `bench-reports/`, and `*.msi` artifacts are intentionally excluded from version control.
