/**
 * TaskQueue · 接 SkillRouter + HarnessLoop 真实运行（替换 M4 mock）
 */
import type { EventBus } from '../sse/SseBroker.js';
import type { SqliteTraceStore } from '@cua-lark/core/src/trace/SqliteTraceStore.js';
import type { SkillRegistry } from '@cua-lark/core/src/skill/SkillRegistry.js';
import type {
  SkillRouterImpl,
  HarnessLoop,
  LarkOperator,
  ModelClient,
  PauseController,
} from '@cua-lark/core';
import { PauseControllerImpl } from '@cua-lark/core/src/harness/PauseController.js';
import { ulid } from 'ulid';
import type { PauseReason } from '@cua-lark/core/src/trace/EventBus.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Best-effort window activator for win32. Iterates a list of process names,
 * picks the first process that has a non-zero MainWindowHandle, and calls
 * AppActivate on its PID. Optional `titlePattern` further filters processes
 * whose `MainWindowTitle` contains the substring (case-insensitive) — used
 * to disambiguate when several `electron`-named processes are running.
 *
 * Never throws. Returns a small status record for logging.
 */
async function activateWindowByProcess(
  names: readonly string[],
  titlePattern?: string,
): Promise<{ ok: boolean; reason: string }> {
  if (process.platform !== 'win32') {
    return { ok: false, reason: `unsupported platform ${process.platform}` };
  }

  // NOTE: avoid ':' inside double-quoted PS strings — PowerShell treats `$var:`
  // as a PSDrive scope qualifier and ParserError-fails. Use '|' as separator.
  const namesPs = names.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');
  const titleFilter = titlePattern
    ? ` | Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle.ToLower().Contains('${titlePattern.toLowerCase().replace(/'/g, "''")}') }`
    : '';

  const script = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName Microsoft.VisualBasic
$activated = $false
foreach ($name in @(${namesPs})) {
  $proc = Get-Process -Name $name -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }${titleFilter} | Select-Object -First 1
  if ($proc) {
    [Microsoft.VisualBasic.Interaction]::AppActivate($proc.Id) | Out-Null
    $activated = $true
    Write-Output ('ok|' + $name + '|' + $proc.Id)
    break
  }
}
if (-not $activated) { Write-Output 'miss' }
`.trim();

  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: 5000 },
    );
    const out = stdout.trim();
    if (out.startsWith('ok|')) {
      return { ok: true, reason: out };
    }
    return { ok: false, reason: `no MainWindow for [${names.join(',')}]${titlePattern ? ` title~${titlePattern}` : ''}` };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Bring the cua-lark Electron chat window back to the foreground after a
 * task ends. Filtered by title substring 'cua' so we don't grab some
 * unrelated Electron app (VSCode, Slack, etc.). Renderer sets the window
 * title to e.g. "Lark-CUA"; matching 'cua' covers the variants.
 *
 * Lark/Feishu activation is now driven by the `activate_lark` tool, called
 * by the agent itself — see packages/core/src/tools/act/activate_lark.ts.
 */
function restoreFocusToCUA(): Promise<{ ok: boolean; reason: string }> {
  return activateWindowByProcess(['electron'], 'cua');
}

export interface TaskQueue {
  enqueue(task: { instruction: string; params?: Record<string, unknown> }): Promise<{ taskId: string }>;
  cancel(taskId: string): Promise<boolean>;
  getStatus(taskId: string): TaskStatus | null;
  getTask(taskId: string): QueuedTask | null;
  pauseTask(taskId: string, reason: PauseReason): { paused: boolean; alreadyPaused: boolean; pausedAtIteration: number; reason: PauseReason };
  resumeTask(taskId: string): { resumed: boolean; alreadyRunning: boolean; resumedAtIteration: number };
  skipTaskStep(taskId: string): { skipped: boolean; currentIteration: number };
  size(): number;
}

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';

export interface QueuedTask {
  taskId: string;
  instruction: string;
  params?: Record<string, unknown>;
  status: TaskStatus;
}

export class QueueFull extends Error {
  constructor() {
    super('Task queue full (max 100)');
  }
}

export interface TaskQueueDeps {
  skillRouter: SkillRouterImpl;
  skillRegistry: SkillRegistry;
  harnessLoop: HarnessLoop;
  operator: LarkOperator;
  modelClient: ModelClient | null;
  /** Optional accessibility / OCR clients. Tools (uia_find, ocr_locate) check
   *  ctx.uia / ctx.ocr presence and report "not available" when undefined. */
  uia?: unknown;
  ocr?: unknown;
  /** Cached at boot — true when Lark's UIA tree has ≥50 descendants
   *  (Narrator-triggered a11y on Electron). False → uia_* tools are filtered
   *  out of the per-task whitelist so the agent can't waste turns on them. */
  uiaA11yEnabled?: boolean;
  /** Used to enumerate all registered tool names when computing the
   *  uia-disabled whitelist (template.toolWhitelist = full minus uia_*). */
  toolRegistry?: { list: () => Array<{ name: string }> };
}

export class TaskQueueImpl implements TaskQueue {
  private queue: Array<{ taskId: string; instruction: string; params?: Record<string, unknown> }> = [];
  private taskStatus = new Map<string, TaskStatus>();
  private abortControllers = new Map<string, AbortController>();
  private pauseControllers = new Map<string, PauseController>();
  private isProcessing = false;

  constructor(
    private maxSize: number,
    private eventBus: EventBus,
    private traceStore: SqliteTraceStore,
    private deps?: TaskQueueDeps,
  ) {}

  async enqueue(task: { instruction: string; params?: Record<string, unknown> }): Promise<{ taskId: string }> {
    if (this.queue.length >= this.maxSize) {
      throw new QueueFull();
    }

    const taskId = ulid();
    this.queue.push({ taskId, ...task });
    this.taskStatus.set(taskId, 'queued');

    await this.traceStore.upsertTask({
      id: taskId,
      instruction: task.instruction,
      params: JSON.stringify(task.params || {}),
      status: 'queued',
      enqueuedAt: Date.now(),
    });

    this.processQueue();

    return { taskId };
  }

  async cancel(taskId: string): Promise<boolean> {
    const status = this.taskStatus.get(taskId);
    if (status !== 'queued' && status !== 'running') {
      return false;
    }

    const controller = this.abortControllers.get(taskId);
    if (controller) {
      controller.abort();
    }

    this.taskStatus.set(taskId, 'cancelled');
    await this.traceStore.updateTaskStatus(taskId, 'cancelled');

    this.eventBus.emit({
      kind: 'task_cancelled',
      taskId,
    });

    return true;
  }

  getStatus(taskId: string): TaskStatus | null {
    return this.taskStatus.get(taskId) || null;
  }

  getTask(taskId: string): QueuedTask | null {
    const status = this.taskStatus.get(taskId);
    if (!status) return null;
    
    const queued = this.queue.find(t => t.taskId === taskId);
    if (queued) {
      return { ...queued, status };
    }
    
    return { taskId, instruction: '', status };
  }

  pauseTask(taskId: string, reason: PauseReason): { paused: boolean; alreadyPaused: boolean; pausedAtIteration: number; reason: PauseReason } {
    const status = this.taskStatus.get(taskId);
    if (status !== 'running') {
      return { paused: false, alreadyPaused: status === 'paused', pausedAtIteration: 0, reason };
    }

    const pauseController = this.pauseControllers.get(taskId);
    if (!pauseController) {
      return { paused: false, alreadyPaused: false, pausedAtIteration: 0, reason };
    }

    const result = pauseController.pause(reason);
    if (result.paused) {
      this.taskStatus.set(taskId, 'paused');
    }

    return { ...result, reason };
  }

  resumeTask(taskId: string): { resumed: boolean; alreadyRunning: boolean; resumedAtIteration: number } {
    const status = this.taskStatus.get(taskId);
    if (status !== 'paused') {
      return { resumed: false, alreadyRunning: status === 'running', resumedAtIteration: 0 };
    }

    const pauseController = this.pauseControllers.get(taskId);
    if (!pauseController) {
      return { resumed: false, alreadyRunning: false, resumedAtIteration: 0 };
    }

    const result = pauseController.resume();
    if (result.resumed) {
      this.taskStatus.set(taskId, 'running');
    }

    return result;
  }

  skipTaskStep(taskId: string): { skipped: boolean; currentIteration: number } {
    const pauseController = this.pauseControllers.get(taskId);
    if (!pauseController) {
      return { skipped: false, currentIteration: 0 };
    }

    const result = pauseController.skipNextTool();
    return { skipped: result.skipped, currentIteration: pauseController.pausedAtIteration ?? 0 };
  }

  size(): number {
    return this.queue.length;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) continue;

      this.taskStatus.set(task.taskId, 'running');
      await this.traceStore.updateTaskStatus(task.taskId, 'running', { startedAt: Date.now() });

      const startedAt = Date.now();
      const controller = new AbortController();
      this.abortControllers.set(task.taskId, controller);

      try {
        const result = await this.executeTask(task, controller.signal);

        this.taskStatus.set(task.taskId, result.success ? 'completed' : 'failed');
        await this.traceStore.updateTaskStatus(task.taskId, result.success ? 'completed' : 'failed', {
          finishedAt: Date.now(),
          finishedReason: result.reason,
          totalTokens: result.totalTokens,
          routedSkill: result.routedSkill,
        });

        this.eventBus.emit({
          kind: 'task_finished',
          taskId: task.taskId,
          success: result.success,
          reason: result.reason,
          durationMs: Date.now() - startedAt,
          totalTokens: result.totalTokens,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'unknown_error';
        this.taskStatus.set(task.taskId, 'failed');
        await this.traceStore.updateTaskStatus(task.taskId, 'failed', {
          finishedAt: Date.now(),
          finishedReason: msg,
        });

        this.eventBus.emit({
          kind: 'task_failed',
          taskId: task.taskId,
          error: { kind: 'unknown', message: msg },
        });

        this.eventBus.emit({
          kind: 'task_finished',
          taskId: task.taskId,
          success: false,
          reason: msg,
          durationMs: Date.now() - startedAt,
          totalTokens: 0,
        });
      } finally {
        this.abortControllers.delete(task.taskId);
        this.pauseControllers.delete(task.taskId);
        // After every terminal state, hand focus back to the cua-lark chat
        // window so the user isn't stranded staring at Feishu. Best-effort.
        try {
          const restore = await restoreFocusToCUA();
          console.log(`[taskqueue] restore focus → cua-lark: ${restore.ok ? 'ok' : 'miss'} (${restore.reason})`);
        } catch (err) {
          console.warn('[taskqueue] restoreFocusToCUA threw:', err);
        }
      }
    }

    this.isProcessing = false;
  }

  /**
   * 真实执行：SkillRouter 选 template → HarnessLoop 跑 ReAct → 返回结果
   * 没有 deps（modelClient/harnessLoop 等）时降级为 mock，不至于 server 启动崩。
   */
  private async executeTask(
    task: { taskId: string; instruction: string; params?: Record<string, unknown> },
    signal: AbortSignal,
  ): Promise<{ success: boolean; reason: string; totalTokens: number; routedSkill: string }> {
    if (!this.deps || !this.deps.modelClient) {
      throw new Error(
        'cua-lark backend not fully wired: missing ModelClient (check CUA_VLM_BASE_URL / CUA_VLM_API_KEY / CUA_VLM_MODEL in .env). 不再使用 M4 mock 路径。',
      );
    }

    const { harnessLoop, operator, modelClient, skillRegistry, uiaA11yEnabled, toolRegistry } = this.deps;

    // Adaptive UIA disablement (per docs/uia-feasibility-report-v2.md):
    // when Lark's UIA tree is empty (a11y off), drop uia_* tools from the
    // per-task whitelist so the agent isn't tempted to call them. Leaves
    // verify_a11y in too, which depends on the same a11y substrate.
    let toolWhitelist: string[] | undefined;
    if (uiaA11yEnabled === false && toolRegistry) {
      const UIA_TOOLS = new Set(['uia_find', 'uia_find_all', 'verify_a11y']);
      toolWhitelist = toolRegistry.list()
        .map((t) => t.name)
        .filter((n) => !UIA_TOOLS.has(n));
    }

    // Free-exploration mode: skill router is bypassed. The agent receives the
    // raw instruction + atomic tools + a "可用技能" catalog of registered
    // SKILL.md macros. It decides via load_skill whether/which to pull in.
    // The task's user instruction is plumbed into template.description so it
    // surfaces as the "## 任务说明" section in the system prompt.
    const routed = {
      template: {
        name: 'free_explore',
        description: task.instruction,
        systemPrompt: '',
        finishCriteria: '',
        maxLoopIterations: 30,
        toolWhitelist,
        sideEffects: undefined,
        fewShots: undefined,
        skillDir: undefined,
      },
      params: task.params || {},
      confidence: 1.0,
    };

    // Adapter: SkillRegistry → SkillCatalog interface. The agent uses
    // catalog.list() (rendered into the "## 可用技能" prompt section) to see
    // what's loadable, and load_skill calls catalog.getBody(name) to pull in
    // the SKILL.md body for the rest of the run.
    const skillCatalog = skillRegistry
      ? {
          list: () =>
            skillRegistry.list().map((s: any) => ({
              name: s.name,
              description: s.description ?? '',
            })),
          getBody: (name: string) => {
            const s = skillRegistry.get(name) as any;
            return (s && s.systemPrompt) || undefined;
          },
        }
      : undefined;

    if (signal.aborted) {
      return { success: false, reason: 'cancelled', totalTokens: 0, routedSkill: routed.template?.name ?? '' };
    }

    // 2. emit task_started 含 routedSkill
    this.eventBus.emit({
      kind: 'task_started',
      taskId: task.taskId,
      instruction: task.instruction,
      routedSkill: routed.template.name,
      startedAt: Date.now(),
    });

    // 2b. Lark/Feishu activation is now agent-driven via the `activate_lark`
    // tool — see PromptBuilder "执行原则" section #1. The agent must call it
    // as the first action of every task; auto-focus would mask agents that
    // don't learn the pattern.

    // 3. 创建 pauseController
    const pauseController = new PauseControllerImpl();
    this.pauseControllers.set(task.taskId, pauseController);

    // 3. 跑 HarnessLoop
    const ctx = {
      operator,
      model: modelClient,
      uia: this.deps.uia,
      ocr: this.deps.ocr,
      trace: this.traceStore,
      testRunId: task.taskId,
      parentTraceId: task.taskId,
      iteration: 0,
      params: { ...(task.params || {}), ...(routed.params || {}) },
      taskId: task.taskId,
      skillCatalog,
      loadedSkillBodies: new Map<string, string>(),
      config: {
        maxLoopIterations: routed.template.maxLoopIterations ?? 30,
        maxTokensPerSkill: 120000,
        messageHistoryLimit: 5,
        loopDetectionThreshold: 3,
      },
      logger: {
        info: (...args: unknown[]) => console.log('[harness]', ...args),
        warn: (...args: unknown[]) => console.warn('[harness]', ...args),
        error: (...args: unknown[]) => console.error('[harness]', ...args),
      },
      signal,
      pauseController,
    };

    const result = await harnessLoop.run(routed.template, ctx as any);

    return {
      success: result.success,
      reason: result.finishedReason,
      totalTokens: result.totalTokens,
      routedSkill: routed.template.name,
    };
  }
}

export function createTaskQueue(
  maxSize: number,
  eventBus: EventBus,
  traceStore: SqliteTraceStore,
  deps?: TaskQueueDeps,
): TaskQueue {
  return new TaskQueueImpl(maxSize, eventBus, traceStore, deps);
}
