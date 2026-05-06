# CUA-Lark（中文版）

> [English](./README.md) · 中文

CUA-Lark 是一个 TypeScript monorepo，用于在飞书 / Lark 桌面客户端上跑计算机使用 (Computer Use) 智能体。智能体通过 VLM 感知屏幕、按 ReAct 循环规划下一步、用 NutJS 操作器实际控制鼠标键盘，并支持 UIA / OCR 作为定位降级链路。破坏性操作通过风险闸门人工确认后才执行。

---

## 目录

- [快速启动](#快速启动)（**重点**）
- [功能亮点](#功能亮点)
- [仓库结构](#仓库结构)
- [配置](#配置)
- [常用命令](#常用命令)
- [启用 UIA（可选）](#启用-uiawindows-可选)
- [排错速查](#排错速查)
- [架构 · ReAct 循环 · Prompt 工程](#架构--react-循环--prompt-工程)

---

## 快速启动

### 0 · 前置依赖

| 项 | 版本 / 说明 |
|---|---|
| Node.js | `>=20.0.0` |
| pnpm | `>=9.0.0`（没装可 `corepack enable && corepack prepare pnpm@9.0.0 --activate`） |
| Python | `>=3.8`（仅 OCR bridge 需要） |
| 飞书 / Lark 桌面客户端 | 已登录、能正常进群 |
| VLM endpoint | OpenAI 协议兼容，例如 qwen3-vl-plus / qwen2.5-vl-plus / glm-5v-turbo |

### 1 · 第一次安装

```powershell
# 仓库根目录
pnpm install
pnpm build

# OCR bridge（可选但建议装）
cd packages/ocr-bridge
pip install paddleocr fastapi "uvicorn[standard]" rapidocr-onnxruntime pillow
cd ../..

# Electron 前端是独立 workspace，单独装
cd frontend
pnpm install
cd ..
```

### 2 · 配置 .env

> ⚠️ **关键易踩坑点**：仓库有两个 `.env` 文件，**后端实际读的是 `packages/server/.env`**，根目录的 `cua-lark/.env` 是早期遗留改它不会生效。

新建 `packages/server/.env`：

```dotenv
# VLM 配置（必填）
CUA_VLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
CUA_VLM_API_KEY=sk-你的key
CUA_VLM_MODEL=qwen3.6-plus

# OCR bridge 地址（可选）—— 不启 OCR 就把这一行删了或注释掉
CUA_OCR_BASE_URL=http://127.0.0.1:7010

# 失败分析 / 规划 LLM（可选）
# CUA_LLM_BASE_URL=...
# CUA_LLM_API_KEY=...
# CUA_LLM_MODEL=...
```

### 3 · 启动顺序（**按这个顺序**起服务）

每个服务开**独立终端**，启动好不要关。

#### ① OCR bridge（可选，需要 OCR 就先起）

```powershell
cd packages/ocr-bridge
python server.py
```

启动成功标志（约 5–15s，第一次会下模型权重）：
```
[INFO] Using RapidOCR fallback engine
[INFO] Starting OCR Bridge on http://127.0.0.1:7010
INFO:     Application startup complete.
```

健康检查：
```powershell
curl http://127.0.0.1:7010/health
# {"status":"ok","engine":"rapidocr_fallback",...}
```

> 不启 OCR 就在 `packages/server/.env` 里**注释掉** `CUA_OCR_BASE_URL`，否则后端起来后调 `ocr_locate` 会反复 502。

#### ② 后端（必启，Fastify :7878）

新终端：

```powershell
pnpm --filter @cua-lark/server dev
```

启动成功标志：
```
[server] ModelClient initialized: qwen3.6-plus
[server] UiaClient initialized: enabled=false nodeCount=2
[server] OcrClient initialized: http://127.0.0.1:7010 healthy=true
[server] ToolRegistry: 29 tools registered
[server] SkillRegistry: 5 skills loaded ...
Server listening on http://127.0.0.1:7878
```

健康检查：
```powershell
curl http://127.0.0.1:7878/health
# {"status":"ok","a11y":"disabled","ocr":"available","vlm":"available"}
```

`a11y: disabled` 是正常状态——除非你做过下面"启用 UIA"那一节，否则就该是 disabled，UIA 工具会被自动从工具白名单里剔除。

#### ③ Electron 前端（必启，聊天窗口）

新终端：

```powershell
cd frontend
pnpm dev
```

电子窗口会自动弹出。窗口里输入框就是聊天界面，**直接发自然语言指令**给后端跑 ReAct 循环。

> Electron 主进程会自动 spawn 一个 vite 进程跑 Dashboard 在 :5174，**不需要手动起 dashboard**。如果遇到问题需要单独起 Dashboard，参考下一步。

#### ④ Dashboard（默认自动起，手动备用）

```powershell
pnpm --filter @cua-lark/dashboard dev
```

监听 :5174。直接浏览器打开 `http://127.0.0.1:5174` 看任务历史、失败聚类、few-shot 标注页。Electron 窗口右上角也有 Dashboard 入口跳转。

### 4 · 验证可用

后端 `/health` 返回 `vlm: available` → 在 Electron 聊天框输入：

```
在 CUA-Lark-Test 群中发送 Hello
```

观察：
- Electron 窗口会显示流式 thought / tool_call / observation
- 飞书桌面客户端被拉到前台
- agent 切到目标群、定位输入框、type、Enter
- 群里出现"Hello"

如果某一步卡住，看 [排错速查](#排错速查)。

---

## 功能亮点

- **prompt 驱动的 ReAct 运行时（`HarnessLoop`）** — 中文系统提示，从工具注册表动态构建；JSON 工具调用，模型输出非 JSON 时自动 retry-nudge 纠偏；工具名规范化（`stop` / `done` / `complete` → `finished`）；工具调用前检查 abort 信号；SSE 流式 trace 事件
- **工具注册 + 白名单** — 感知 (`screenshot`、`ocr_locate`、`wait_for_loading`)、行动 (`click`、`type`、`hotkey`、`scroll` …)、验证 (`failure_analyst`、`risk_classifier`)、元 (`ASK_USER`、`record_evidence`、`finished`)。System prompt 只列白名单，未知工具名后端用中文 observation 列出真实白名单纠正
- **风险闸门** — 破坏性工具（`delete_*` / `dismiss_group` / `clear_recall` …）和高危关键词在执行前被 `RiskGate` 拦截，发 `risk_confirmation_required` 事件，循环挂起直到 `POST /tasks/:id/confirm` 响应。规则配在 `configs/risk-gate.yaml`
- **自愈执行器** — 任务终态失败时 `failure_analyst` 产出 `{ rootCause, alternativeStrategy, confidence }`，`SelfHealingExecutor` 按置信度 + 不可重试 reason 白名单决定是否重入循环
- **训练数据沉淀** — `EmbeddingClient` / `FewShotMiner` / `FailureClusterer` 把成功 trace 挖成 few-shot、把失败按错误类型聚类。通过 `/curation/*` HTTP 路由 + dashboard 暴露
- **SQLite trace 存储** — task 行 + event 行，WAL 模式，幂等写入，JSONL 迁移工具
- **SKILL 库** — `_common`（弹窗关闭、权限拒绝处理）、`lark_im`（搜索联系人、发消息、撤回、验证）、`lark_calendar`（日程提示）、`lark_docs`（云文档提示）。procedural skill 仍支持 fallback 但 harness 也能直接驱动自然语言任务
- **Electron 前端** — vendored 自 UI-TARS-desktop fork，通过 SSE 连后端；全局 ESC 中止任务；风险确认弹窗 / 任务运行指示器走共享 zustand store

---

## 仓库结构

```text
packages/
  core/         HarnessLoop / PromptBuilder / 工具注册 / SQLite trace / SelfHealing
    src/harness/      ReAct 循环 + prompt 构建 + 自愈执行
    src/model/        VLM/LLM 客户端 / 流式解析 / HTTP 重试
    src/operator/     LarkOperator + ActionVerifier
    src/preflight/    环境 / 进程 / OCR bridge 健康检查
    src/skill/        SKILL 定义 / 注册 / 运行
    src/suite/        YAML 测试加载与执行
    src/tools/        ToolRegistry / RiskGate / 各工具
    src/trace/        SQLite TraceStore / EventBus / TracePersister
    src/data/         EmbeddingClient / FewShotMiner / FailureClusterer
    src/verifier/     VLM / OCR / 复合验证器
  server/       Fastify HTTP + SSE 路由（task / trace / confirm / curation）
  dashboard/    React 后台
  skills/
    _common/          弹窗关闭、权限拒绝
    lark_im/          IM 工作流
    lark_calendar/    日历提示
    lark_docs/        云文档提示
  cli/          exec / run / bench / prompt 命令
  uia-bridge/   Windows UIA bridge（PowerShell 子进程）
  ocr-bridge/   Python FastAPI（PaddleOCR / RapidOCR）
frontend/       Electron 应用（独立 pnpm workspace）
  main/         Electron 主进程（escapeStop / runAgent / windowManager）
  preload/      preload bridge
  renderer/     React UI
configs/        harness / robustness / risk-gate / server YAML
testcases/      YAML workflow 测试用例
plans/          实施计划文档
bench-reports/  benchmark / A/B 测试报告
scripts/        guard / 迁移 / 端到端测试
```

---

## 配置

主配置文件在 `configs/`：

| 文件 | 用途 |
|---|---|
| `harness.yaml` | HarnessLoop 默认值（最大迭代数、模型超时…） |
| `robustness.yaml` | ActionVerifier 阈值与豁免 |
| `risk-gate.yaml` | 破坏性工具列表、高危关键词、级别→策略映射 |
| `server.yaml` | Fastify 端口、CORS、auth |
| `test-targets.yaml` | 各环境的测试目标数据（群名…） |

`.env` 在 [快速启动](#2--配置-env) 已说明。Shell 环境变量优先级 > `.env`。

---

## 常用命令

```powershell
# 依赖管理
pnpm install
pnpm build
pnpm typecheck
pnpm test

# 静态 prompt 检查（验证 prompt 预算 / 占位符 / 锚点）
pnpm check:prompt

# 单条任务（CLI 直跑，不走后端 server）
node packages\cli\bin\cua-lark.js exec "在 CUA-Lark-Test 群中发送 Hello"

# YAML 用例
node packages\cli\bin\cua-lark.js run "testcases/im/*.yaml"

# 真桌面端到端（带屏幕操作）
pnpm test:e2e:real -- "在 CUA-Lark-Test 群中发送 Hello，然后撤回这条消息" --max-iterations 35

# 通过后端 server 提交任务（建任务行 + SSE 流）
node packages\cli\bin\cua-lark.js prompt "打开 CUA-Lark-Test 群但不要发消息" --max-iterations 20
```

---

## 启用 UIA（Windows 可选）

飞书桌面客户端是 Electron 应用，**默认不向 Windows UI Automation 暴露内部控件树**。a11y 启用前 `uia_find` / `uia_find_all` / `verify_a11y` 三个工具拿不到任何控件，所以服务器启动时会探测 a11y 状态，未启用就**自动从 agent 工具白名单里剔除这三个工具**，避免浪费迭代。

要开 UIA：

1. **第一次启动飞书前**做：`Win + Ctrl + Enter` 打开 Windows 旁白（Narrator），让它说几秒话
2. 再次 `Win + Ctrl + Enter` 关闭旁白
3. 重启飞书
4. 重启 cua-lark 后端，看启动日志：
   ```
   [server] UiaClient initialized: enabled=true nodeCount=328
   ```
   `enabled=true` 表示 UIA 树已展开（约 328 个节点 / 47 个 Button / 12 个 Edit），UIA 工具自动重新启用

a11y 状态系统级持久化，**只需做一次**，之后即使关闭旁白、重启飞书、重启电脑都仍生效。

不开 UIA 也能用，OCR + VLM 已覆盖所有定位场景，只是少了一条更快更精确的降级链。

---

## 排错速查

| 现象 | 检查点 |
|---|---|
| 后端启动后 `ModelClient init failed` | `packages/server/.env` 里 `CUA_VLM_*` 三个值齐全；`CUA_VLM_BASE_URL` 末尾不要带斜杠 |
| `/health` 返回 `vlm: unavailable` | VLM API key 错 / endpoint 不通；用 curl 直接打 endpoint 验证 |
| `ocr_locate` 调用 502 | OCR bridge 没起，或 `CUA_OCR_BASE_URL` 不对；不需要 OCR 就注释掉那行环境变量 |
| `uia_find` 总是报 disabled | a11y 没启用——按 [启用 UIA](#启用-uiawindows-可选) 那段做一次旁白触发 |
| Electron 窗口连不上后端 | 后端没起 / :7878 被占用；`netstat -ano \| findstr :7878` 看 PID；杀掉重启 |
| 前端 SSE 报 404 `/stream` | 后端版本旧没有全局 firehose 路由；拉最新 main 重启后端 |
| 任务长时间无响应 | 模型可能在等 reasoning_content；看 `traces/<task-id>/screenshot-*.png` 确认截图状态 |
| 改了 SKILL.md 不生效 | TaskQueue 已支持热重载，下次 `load_skill` 自动读取最新版；但工具池 / 注册表变更仍要重启后端 |
| Electron 启动后空白 | 检查终端有没有 `installExtension` / `EventSource` 报错；这两个之前修过，拉最新 main |
| 跑 `pnpm install` 卡住 | 用 `pnpm install --frozen-lockfile=false`；Windows 偶尔遇到 better-sqlite3 编译失败，需要 VS Build Tools |

后端实时日志：终端直接看；trace DB：`packages/server/traces/cua-lark.db`（SQLite）；任务截图：`packages/server/traces/<task-id>/screenshot-N.png`。

---

## 架构 · ReAct 循环 · Prompt 工程

### ReAct 循环要点

- **prompt 构建**：`PromptBuilder` 从 live 工具注册表组装系统提示。每条 prompt 显式列白名单工具名，并附 `finished` 调用范例
- **工具名规范化**：`left_click` / `take_screenshot` / `press_key` / `done` / `task_complete` / `stop` 等别名映射到规范名再查表；未知名给中文 corrective observation
- **retry nudge**：模型输出非 JSON 时下一次请求附中文 user 消息，提醒 schema 并提供 `finished` 模板
- **取消**：循环每次工具执行前检查 `signal.aborted`，避免"模型已返回 → 工具未跑"之间残留 click
- **风险闸门**：破坏性 / 高危调用挂起循环发 `risk_confirmation_required`，前端确认 / 超时后再决定继续或终止
- **自愈**：终态失败 `failure_analyst` → `{ errorKind, rootCause, alternativeStrategy, confidence }`，置信度 ≥ 阈值 + reason 不在 unretryable 列表（`permission_denied` / `risk_denied` / `max_iterations_reached` / `budget_exceeded` / `tool_call_parse_failed` / agent 主动声明 "需要先 search_contact" 等）才重入

### Prompt 工程

System prompt 拼接源：

- `packages/core/src/harness/prompts/base.system.md` — 思考结构（XML 4 段：observation / analysis / plan / action）+ 工具契约
- `packages/core/src/harness/prompts/snippets/*.md` — 6 个可复用片段（4 必装、2 条件装）
  - **必装**：`state-diff-reasoning` / `tool-selection-heuristics` / `loop-prevention` / `finished-criteria`
  - **条件装**：`anchor-checking`（SKILL.md 含"## 锚点状态"段时）、`lark-window-discipline`（skill 名以 `lark_` 开头时）
- 每个 SKILL 的 `SKILL.md` body — 任务说明 / 完成判据 / 锚点 / 常见陷阱（由 `parseSkillBody` 解析）
- 每个 SKILL 的 `few-shots/*.md` — 手写执行轨迹示例，用 `<example>` 标签包裹

**Token 预算**（`@anthropic-ai/tokenizer` + `js-tiktoken` 取大值，cache 友好的稳定上限）：
- base ≤ 1500 tk · 单片段 ≤ 700 tk · skill 实例 ≤ 800 tk · few-shots ≤ 3500 tk · **total ≤ 8000 tk**
- 静态前缀（base + snippets）每个 skill 内常量——prompt cache 友好
- 构造时 + 每次 `build()` 都校验，超限抛 `PromptBudgetExceeded`

跑静态检查：

```powershell
pnpm check:prompt
```

详细设计：[`plans/Prompt-Engineering-Implementation-Plan.md`](./plans/Prompt-Engineering-Implementation-Plan.md)（spec）+ [`plans/Prompt-Engineering-Tasks.md`](./plans/Prompt-Engineering-Tasks.md)（TDD 任务清单）。

A/B 报告：[`bench-reports/prompt-ab-test.md`](./bench-reports/prompt-ab-test.md)。

---

## 退出码

| 码 | 含义 |
|---|---|
| `0` | 命令成功 |
| `1` | Agent / 模型 / 操作器执行失败 |
| `2` | 预检失败（缺环境变量、飞书没起 …） |
| `64` | CLI 用法错 |

---

## 杂项

- 父级目录 `UI-TARS-Desktop` 是参考 vendor，不是运行依赖
- 真任务执行需要可用的 VLM endpoint + 已登录的飞书 / Lark 客户端
- OCR bridge 当前是手动启的 Python 子进程；preflight 自动启动还在做
- `runs/` / `traces/` / `bench-reports/` / `*.msi` 不进版本控制
