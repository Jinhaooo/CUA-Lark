import type { SkillTemplate, HarnessResult, HarnessTrace, HarnessContext } from './types.js';
import { parseSkillBody } from './parseSkillBody.js';
import type { ToolRegistry } from '../tools/types.js';
import { CallUserRequired } from './types.js';
import { ulid } from 'ulid';
import { ZodError } from 'zod';
import type { EventBus } from '../trace/EventBus.js';
import { StreamInterrupted } from '../model/streaming.js';
import { SelfHealingExecutor, type SelfHealingConfig } from './SelfHealingExecutor.js';
import { failureAnalystTool } from '../tools/verify/failure_analyst.js';
import { RiskGate, type RiskGateConfig } from '../tools/RiskGate.js';
import { loadRiskGateConfigFromYaml, toRiskGateConfig } from '../tools/RiskGateConfigLoader.js';
import { PromptBuilder } from './PromptBuilder.js';

/**
 * Escape raw control chars (\n \r \t) that appear *inside* string literals.
 * Stricter VLM outputs are valid JSON; GLM-5V emits pretty-printed multi-line
 * strings that JSON.parse rejects. Walk the text, track string-vs-structural
 * context, and replace literal control chars with their escape sequences only
 * inside strings.
 */
function sanitizeJsonStringNewlines(s: string): string {
  let out = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (escape) { out += c; escape = false; continue; }
    if (c === '\\') { out += c; escape = true; continue; }
    if (c === '"') { inString = !inString; out += c; continue; }
    if (inString) {
      if (c === '\n') { out += '\\n'; continue; }
      if (c === '\r') { out += '\\r'; continue; }
      if (c === '\t') { out += '\\t'; continue; }
    }
    out += c;
  }
  return out;
}

/**
 * Tolerant JSON object extraction. Some VLM endpoints (GLM-5V, certain
 * Qwen versions in non-strict mode) wrap the JSON in ```json fences,
 * prefix it with prose like "Here is the response:", or pretty-print it
 * with raw newlines inside string values. This helper peels each layer
 * off before retrying.
 */
function extractJsonObject(text: string): unknown {
  try { return JSON.parse(text); } catch {}

  const trimmed = text.trim();

  const fence = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fence && fence[1]) {
    const inner = fence[1].trim();
    try { return JSON.parse(inner); } catch {}
    try { return JSON.parse(sanitizeJsonStringNewlines(inner)); } catch {}
  }

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const slice = trimmed.slice(first, last + 1);
    try { return JSON.parse(slice); } catch {}
    try { return JSON.parse(sanitizeJsonStringNewlines(slice)); } catch {}
  }

  // Last resort: sanitize the whole text and retry brace extraction.
  const sanitized = sanitizeJsonStringNewlines(trimmed);
  const sFirst = sanitized.indexOf('{');
  const sLast = sanitized.lastIndexOf('}');
  if (sFirst >= 0 && sLast > sFirst) {
    try { return JSON.parse(sanitized.slice(sFirst, sLast + 1)); } catch {}
  }

  throw new SyntaxError('Could not extract JSON object from model response');
}

async function checkPauseAndWait(ctx: HarnessContext): Promise<'resumed' | 'cancelled'> {
  const pauseController = ctx.pauseController;
  if (!pauseController) {
    return 'resumed';
  }

  if (pauseController.state === 'paused') {
    await pauseController.waitForResume();
  }

  return 'resumed';
}

export class HarnessLoop {
  private toolRegistry: ToolRegistry;
  private eventBus?: EventBus;
  private selfHealingExecutor?: SelfHealingExecutor;
  private riskGate: RiskGate;

  constructor(
    toolRegistry: ToolRegistry,
    eventBus?: EventBus,
    selfHealingConfig?: Partial<SelfHealingConfig>,
    riskGateConfig?: Partial<RiskGateConfig>
  ) {
    this.toolRegistry = toolRegistry;
    this.eventBus = eventBus;
    if (selfHealingConfig !== null) {
      this.selfHealingExecutor = new SelfHealingExecutor(selfHealingConfig);
    }
    this.riskGate = new RiskGate(
      riskGateConfig ?? toRiskGateConfig(loadRiskGateConfigFromYaml())
    );
  }

  private emit(event: any): void {
    if (this.eventBus) {
      try {
        this.eventBus.emit(event);
      } catch {
      }
    }
  }

  async run(template: SkillTemplate, ctx: HarnessContext, signal?: AbortSignal): Promise<HarnessResult> {
    // Fallback: TaskQueue passes the cancel signal inside ctx; honour it so DELETE
    // /tasks/:id reliably aborts (M6 contract: signal terminate > pause).
    const effectiveSignal = signal ?? (ctx as { signal?: AbortSignal }).signal;
    return this.runInternal(template, ctx, effectiveSignal, 0);
  }

  private async runInternal(
    template: SkillTemplate,
    ctx: HarnessContext,
    signal: AbortSignal | undefined,
    selfHealingRetryCount: number
  ): Promise<HarnessResult> {
    const trace: HarnessTrace[] = [];
    let totalTokens = 0;
    let consecutiveUnknownTool = 0;
    const HALLUCINATED_TOOL_LIMIT = 2;
    // Per-task scratchpad for skills the agent has pulled in via load_skill.
    // The tool mutates this Map; HarnessLoop diffs it after each iteration
    // and appends new bodies to messages[0].content for subsequent turns.
    if (!ctx.loadedSkillBodies) {
      ctx.loadedSkillBodies = new Map<string, string>();
    }
    const appendedSkills = new Set<string>();

    // SkillContext drives PromptBuilder's snippet selection + fewshot loading.
    // hasAnchors is computed by parsing the SKILL.md body once; skillDir is
    // expected to be threaded onto the template by SkillRegistry/TaskQueue.
    const skillBody = (template as { systemPrompt?: string }).systemPrompt ?? '';
    const skillContext = {
      skillName: template.name,
      markdownBody: skillBody,
      hasAnchors: !!parseSkillBody(skillBody).anchors,
      skillDir: (template as { skillDir?: string }).skillDir,
      params: ctx.params,
      availableSkills: ctx.skillCatalog?.list() ?? [],
    };
    const systemPrompt = new PromptBuilder(this.toolRegistry).build(template, skillContext);
    const messages: any[] = [{ role: 'system', content: systemPrompt }];
    const recentToolCalls: string[] = [];

    const maxIterations = template.maxLoopIterations ?? ctx.config.maxLoopIterations;
    const startTime = Date.now();
    const modelRequestTimeoutMs = ctx.config.modelRequestTimeoutMs ?? 90000;

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      if (signal?.aborted) {
        this.emit({
          kind: 'task_cancelled',
          taskId: ctx.testRunId,
        });
        return {
          success: false,
          finishedReason: 'cancelled',
          iterations: iteration - 1,
          trace,
          totalTokens,
        };
      }

      if (ctx.pauseController) {
        // Plumb iteration so PauseController records pausedAtIteration accurately.
        (ctx.pauseController as any).currentIteration = iteration;

        if (ctx.pauseController.state === 'paused') {
          // pause/resume SSE emit lives in routes/pause.ts to avoid duplicate events.
          const result = await checkPauseAndWait(ctx);
          if (result === 'cancelled') {
            return {
              success: false,
              finishedReason: 'cancelled',
              iterations: iteration,
              trace,
              totalTokens,
            };
          }
        }
      }

      ctx.iteration = iteration;

      const screenshot = await ctx.operator.screenshot();
      const screenshotPath = `traces/${ctx.testRunId}/screenshot-${iteration}.png`;

      this.emit({
        kind: 'iteration_started',
        taskId: ctx.testRunId,
        iteration,
        screenshotPath,
      });

      const userMessage = {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshot.base64}` } },
          { type: 'text', text: '请观察当前截图，决定下一步操作。严格按 JSON 输出 thought（中文）和 tool_call。' },
        ],
      };

      const recentMessages = messages.slice(-ctx.config.messageHistoryLimit);

      let parsedResponse: any;
      let thought = '';
      let streamTokens = 0;
      let streamError: Error | null = null;

      for (let retry = 0; retry <= 1; retry++) {
        let modelStartedAt = Date.now();
        try {
          thought = '';
          this.emit({
            kind: 'thought_chunk',
            taskId: ctx.testRunId,
            iteration,
            delta: '',
          });

          modelStartedAt = Date.now();
          const requestSignal = createRequestSignal(signal, modelRequestTimeoutMs);
          this.emit({
            kind: 'model_request_started',
            taskId: ctx.testRunId,
            iteration,
            attempt: retry + 1,
            timeoutMs: modelRequestTimeoutMs,
          });

          const retryNudge = {
            role: 'user' as const,
            content: '上次回复未通过 JSON 解析。请严格输出 {"thought":"...","tool_call":{"name":"工具名","args":{...}}}，不要在 JSON 之外附加任何文字。如果你认为任务已经完成，请调用 finished 工具：{"thought":"已完成","tool_call":{"name":"finished","args":{"success":true,"reason":"任务完成原因"}}}',
          };
          const visionMessages = retry === 0
            ? [...recentMessages, userMessage]
            : [...recentMessages, userMessage, retryNudge];
          const visionRequest = {
            messages: visionMessages,
            modelOverride: ctx.config.vlmModel,
            response_format: { type: 'json_object' },
            // Reasoning-class VLMs (qwen3.x-plus, GLM-5V, deepseek-r1) split
            // their output between reasoning_content and content. Without an
            // explicit cap the API default (often 1500–2000) gets eaten by
            // CoT, leaving the content stream truncated mid-JSON. 4096 is the
            // smallest budget that reliably fits 4-section XML thought + JSON
            // wrapper + headroom for reasoning preamble.
            max_tokens: ctx.config.maxResponseTokens ?? 4096,
            signal: requestSignal.signal,
          };

          // Some VLMs (GLM-5V, deepseek-r1) emit the entire response — including
          // the final JSON answer — inside `reasoning_content`, leaving `content`
          // empty. Buffer reasoning separately; if `content` is empty at the end
          // of the stream we fall back to it before parsing.
          let reasoningBuffer = '';
          let lastFinishReason: string | undefined;
          if (typeof ctx.model.chatVisionStream === 'function') {
            try {
              for await (const chunk of ctx.model.chatVisionStream(visionRequest)) {
                if ((chunk as { finishReason?: string }).finishReason) {
                  lastFinishReason = (chunk as { finishReason?: string }).finishReason;
                }
                if (requestSignal.signal.aborted) {
                  throw new Error(requestSignal.reason());
                }
                const reasoningDelta = (chunk as { reasoningDelta?: string }).reasoningDelta;
                if (reasoningDelta) {
                  reasoningBuffer += reasoningDelta;
                  this.emit({
                    kind: 'thought_chunk',
                    taskId: ctx.testRunId,
                    iteration,
                    delta: reasoningDelta,
                  });
                }
                thought += chunk.delta;
                if (chunk.delta) {
                  this.emit({
                    kind: 'thought_chunk',
                    taskId: ctx.testRunId,
                    iteration,
                    delta: chunk.delta,
                  });
                }
                if (chunk.usage) {
                  streamTokens += chunk.usage.totalTokens || 0;
                }
                if (chunk.done) {
                  break;
                }
              }
              // Reasoning-only model: no content delta arrived, but we got CoT
              // text. Parse from there — extractJsonObject() peels prose around
              // the JSON object so this works on GLM-5V's "<think>...{...}" stream.
              if (!thought && reasoningBuffer) {
                thought = reasoningBuffer;
              }
            } finally {
              requestSignal.cleanup();
            }
          } else {
            try {
              const response = await ctx.model.chatVision(visionRequest);
              thought = response.content;
              streamTokens = response.usage?.totalTokens || 0;
              this.emit({
                kind: 'thought_chunk',
                taskId: ctx.testRunId,
                iteration,
                delta: thought,
              });
            } finally {
              requestSignal.cleanup();
            }
          }

          try {
            parsedResponse = extractJsonObject(thought);
            this.emit({
              kind: 'model_request_finished',
              taskId: ctx.testRunId,
              iteration,
              attempt: retry + 1,
              durationMs: Date.now() - modelStartedAt,
              success: true,
            });
            streamError = null;
            break;
          } catch {
            // Capture raw response for debugging — parse failures are otherwise
            // invisible (thought_complete is emitted only on the success path).
            // When BOTH content and reasoning are empty, sample stays "" — that
            // is the smoking gun for "VLM returned nothing parseable at all".
            // finishReason="length" is the smoking gun for "max_tokens cut us off".
            const combined = thought || reasoningBuffer;
            const sample = combined.length > 600 ? combined.slice(0, 600) + '…' : combined;
            const reasonTag = lastFinishReason ? `invalid_json (finish=${lastFinishReason})` : 'invalid_json';
            this.emit({
              kind: 'model_request_finished',
              taskId: ctx.testRunId,
              iteration,
              attempt: retry + 1,
              durationMs: Date.now() - modelStartedAt,
              success: false,
              reason: reasonTag,
              rawSample: sample,
              contentChars: thought.length,
              reasoningChars: reasoningBuffer.length,
            });
            if (retry === 1) {
              throw new Error('Invalid JSON response after retry');
            }
            this.emit({
              kind: 'thought_reset',
              taskId: ctx.testRunId,
              iteration,
              reason: 'stream_interrupted',
            });
          }
        } catch (error) {
          this.emit({
            kind: 'model_request_finished',
            taskId: ctx.testRunId,
            iteration,
            attempt: retry + 1,
            durationMs: Date.now() - modelStartedAt,
            success: false,
            reason: error instanceof Error ? error.message : String(error),
          });
          if (signal?.aborted) {
            streamError = new Error('cancelled');
            break;
          }
          if (error instanceof StreamInterrupted && retry === 0) {
            this.emit({
              kind: 'thought_reset',
              taskId: ctx.testRunId,
              iteration,
              reason: 'stream_interrupted',
            });
            continue;
          }
          streamError = error as Error;
          break;
        }
      }

      if (signal?.aborted || streamError?.message === 'cancelled') {
        this.emit({
          kind: 'task_cancelled',
          taskId: ctx.testRunId,
        });
        return {
          success: false,
          finishedReason: 'cancelled',
          iterations: iteration,
          trace,
          totalTokens,
        };
      }

      if (streamError) {
        const durationMs = Date.now() - startTime;
        this.emit({
          kind: 'task_finished',
          taskId: ctx.testRunId,
          success: false,
          reason: 'stream_interrupted',
          durationMs,
          totalTokens,
        });
        return {
          success: false,
          finishedReason: 'stream_interrupted',
          iterations: iteration,
          trace,
          totalTokens,
        };
      }

      totalTokens += streamTokens;

      this.emit({
        kind: 'thought_complete',
        taskId: ctx.testRunId,
        iteration,
        full: thought,
        tokens: streamTokens,
      });

      const toolCall = normalizeToolCall(parsedResponse.tool_call || parsedResponse.toolCall);

      if (!toolCall?.name) {
        return {
          success: false,
          finishedReason: 'tool_call_parse_failed',
          iterations: iteration,
          trace,
          totalTokens,
        };
      }

      if (toolCall.name === 'finished') {
        const traceEntry: HarnessTrace = {
          iteration,
          thought,
          toolCall,
          observation: toolCall.args?.reason || 'Task finished',
          durationMs: 0,
          cost: { tokens: streamTokens },
        };
        trace.push(traceEntry);

        await this.writeTrace(ctx, 'finished', {
          thought,
          success: toolCall.args?.success,
          reason: toolCall.args?.reason,
        });

        const finishedSuccess = toolCall.args?.success === true;
        const finishedReason = toolCall.args?.reason || 'finished';

        if (!finishedSuccess && this.selfHealingExecutor) {
          const retryCount = selfHealingRetryCount;
          const iterationsBefore = iteration;

          if (this.selfHealingExecutor.shouldRetry(finishedReason, retryCount)) {
            const screenshot = await ctx.operator.screenshot();
            const screenshotBase64 = screenshot.base64;

            this.emit({
              kind: 'self_healing_attempted',
              taskId: ctx.testRunId,
              reason: finishedReason,
              confidence: 1.0,
            });

            const analysisResult = await this.selfHealingExecutor.analyze(
              trace,
              finishedReason,
              screenshotBase64,
              async (traceEntries, reason, screenshot) => {
                const result = await failureAnalystTool.execute(ctx as any, {
                  trace: traceEntries,
                  finishedReason: reason,
                  screenshotBase64: screenshot,
                });
                return result.data || {
                  errorKind: 'unknown',
                  rootCause: reason,
                  alternativeStrategy: 'Review manually',
                  confidence: 0,
                };
              }
            );

            const skipCause = this.selfHealingExecutor.getSkipCause(finishedReason, analysisResult.confidence, retryCount);

            if (skipCause) {
              this.emit({
                kind: 'self_healing_skipped',
                taskId: ctx.testRunId,
                reason: finishedReason,
                skipCause,
              });
            } else {
              const newSystemPrompt = this.selfHealingExecutor.buildRetryPrompt(
                template.systemPrompt,
                analysisResult
              );

              this.emit({
                kind: 'self_healing_succeeded',
                taskId: ctx.testRunId,
                iterationsBefore,
                iterationsAfter: iteration + 1,
              });

              const retryResult = await this.runInternal(
                { ...template, systemPrompt: newSystemPrompt },
                ctx,
                signal,
                retryCount + 1
              );

              return {
                ...retryResult,
                iterations: iterationsBefore + retryResult.iterations,
                trace: [...trace, ...retryResult.trace],
                totalTokens: totalTokens + retryResult.totalTokens,
              };
            }
          } else {
            const skipCause = this.selfHealingExecutor.getSkipCause(finishedReason, 0, retryCount);
            if (skipCause) {
              this.emit({
                kind: 'self_healing_skipped',
                taskId: ctx.testRunId,
                reason: finishedReason,
                skipCause,
              });
            }
          }
        }

        const durationMs = Date.now() - startTime;
        this.emit({
          kind: 'task_finished',
          taskId: ctx.testRunId,
          success: finishedSuccess,
          reason: finishedReason,
          durationMs,
          totalTokens,
        });

        return {
          success: finishedSuccess,
          finishedReason,
          iterations: iteration,
          trace,
          totalTokens,
        };
      }

      const toolCallKey = JSON.stringify({ name: toolCall.name, args: toolCall.args });
      recentToolCalls.push(toolCallKey);
      if (recentToolCalls.length > ctx.config.loopDetectionThreshold) {
        recentToolCalls.shift();
      }

      const uniqueCalls = new Set(recentToolCalls);
      if (uniqueCalls.size === 1 && recentToolCalls.length >= ctx.config.loopDetectionThreshold) {
        await this.writeTrace(ctx, 'vlm_loop_detected', { toolCall });
        const durationMs = Date.now() - startTime;
        this.emit({
          kind: 'task_finished',
          taskId: ctx.testRunId,
          success: false,
          reason: 'vlm_loop_detected',
          durationMs,
          totalTokens,
        });
        return {
          success: false,
          finishedReason: 'vlm_loop_detected',
          iterations: iteration,
          trace,
          totalTokens,
        };
      }

      if (totalTokens >= ctx.config.maxTokensPerSkill) {
        await this.writeTrace(ctx, 'budget_exceeded', { totalTokens });
        const durationMs = Date.now() - startTime;
        this.emit({
          kind: 'task_finished',
          taskId: ctx.testRunId,
          success: false,
          reason: 'budget_exceeded',
          durationMs,
          totalTokens,
        });
        return {
          success: false,
          finishedReason: 'budget_exceeded',
          iterations: iteration,
          trace,
          totalTokens,
        };
      }

      this.emit({
        kind: 'tool_call',
        taskId: ctx.testRunId,
        iteration,
        name: toolCall.name,
        args: toolCall.args,
      });

      // 工具执行前再次检查 abort：流式响应可能在用户按 stop 后才解析完，
      // 这里拦截一次避免 stop 后还执行一次鼠标/键盘动作
      if (signal?.aborted) {
        this.emit({
          kind: 'task_cancelled',
          taskId: ctx.testRunId,
        });
        return {
          success: false,
          finishedReason: 'cancelled',
          iterations: iteration,
          trace,
          totalTokens,
        };
      }

      // 工具执行前检查暂停状态（C19 强约束）。
      // pause/resume SSE emit lives in routes/pause.ts; HarnessLoop only blocks here.
      if (ctx.pauseController && ctx.pauseController.state === 'paused') {
        const result = await checkPauseAndWait(ctx);
        if (result === 'cancelled') {
          return {
            success: false,
            finishedReason: 'cancelled',
            iterations: iteration,
            trace,
            totalTokens,
          };
        }
      }

      // skip-step：用户在 paused 时点击"跳过当前 tool"，直接绕过本次执行。
      if (ctx.pauseController && (ctx.pauseController as any).consumeSkip?.()) {
        const skipObs = `tool '${toolCall.name}' skipped by user via skip-step`;
        const traceEntry: HarnessTrace = {
          iteration,
          thought,
          toolCall,
          observation: skipObs,
          durationMs: 0,
          cost: { tokens: streamTokens },
        };
        trace.push(traceEntry);
        this.emit({
          kind: 'tool_result',
          taskId: ctx.testRunId,
          iteration,
          success: true,
          observation: skipObs,
          durationMs: 0,
        });
        this.emit({
          kind: 'iteration_complete',
          taskId: ctx.testRunId,
          iteration,
          durationMs: 0,
          cost: { tokens: streamTokens },
        });
        messages.push({ role: 'assistant', content: JSON.stringify({ thought, toolCall }) });
        messages.push({ role: 'user', content: skipObs });
        continue;
      }

      const toolStartTime = Date.now();
      let observation: string;
      let success = true;

      try {
        if (toolCall.name === 'call_user') {
          throw new CallUserRequired(toolCall.args?.question || '');
        }

        const tool = this.toolRegistry.get(toolCall.name);
        if (!tool || (template.toolWhitelist && !template.toolWhitelist.includes(toolCall.name))) {
          consecutiveUnknownTool += 1;

          // Fail-fast: a model that hallucinates two tool calls in a row will
          // not recover by being told the whitelist a third time. Surface a
          // terminal failure so the user sees the wedge instead of waiting
          // through max_iterations.
          if (consecutiveUnknownTool >= HALLUCINATED_TOOL_LIMIT) {
            const reason = `tool_hallucination_detected: '${toolCall.name}' (and prior call) not in whitelist`;
            await this.writeTrace(ctx, 'tool_hallucination', { lastUnknown: toolCall.name });
            const durationMs = Date.now() - startTime;
            this.emit({
              kind: 'task_finished',
              taskId: ctx.testRunId,
              success: false,
              reason,
              durationMs,
              totalTokens,
            });
            return {
              success: false,
              finishedReason: reason,
              iterations: iteration,
              trace,
              totalTokens,
            };
          }

          const availableNames = this.toolRegistry
            .list({ whitelist: template.toolWhitelist })
            .map((t) => t.name);
          observation =
            `工具调用错误：不存在名为 "${toolCall.name}" 的工具。这是第 ${consecutiveUnknownTool} 次连续错调，` +
            `若再错一次任务将自动失败终止。\n` +
            `合法工具名只有以下这些（必须严格匹配，不要自创、不要改写）：\n${availableNames.map((n) => `- ${n}`).join('\n')}\n` +
            `若你认为任务已完成，立刻调用 finished：{"thought":"...","tool_call":{"name":"finished","args":{"success":true,"reason":"..."}}}`;
          success = false;
        } else {
          consecutiveUnknownTool = 0;
          const args = tool.argsSchema.parse(toolCall.args ?? {});
          const pauseSignal = ctx.pauseController?.pauseSignal();
          const result = tool.category === 'meta' || this.riskGate.shouldSkipRiskGate(template.name)
            ? await tool.execute({ ...ctx, pauseSignal } as any, args)
            : await this.riskGate.executeWithRiskGate(tool, { ...ctx, pauseSignal } as any, args, this.eventBus);
          observation = result.observation;
          success = result.success;
        }
      } catch (error) {
        if (error instanceof CallUserRequired) {
          throw error;
        }
        observation = error instanceof ZodError
          ? `Invalid tool arguments for ${toolCall.name}: ${error.message}`
          : `Error: ${error instanceof Error ? error.message : String(error)}`;
        success = false;
      }

      const toolDurationMs = Date.now() - toolStartTime;

      this.emit({
        kind: 'tool_result',
        taskId: ctx.testRunId,
        iteration,
        success,
        observation,
        durationMs: toolDurationMs,
      });

      const traceEntry: HarnessTrace = {
        iteration,
        thought,
        toolCall,
        observation,
        durationMs: toolDurationMs,
        cost: { tokens: streamTokens },
      };
      trace.push(traceEntry);

      await this.writeTrace(ctx, 'harness_iteration', {
        iteration,
        thought,
        toolCall,
        observation,
        durationMs: toolDurationMs,
        success,
      });

      this.emit({
        kind: 'iteration_complete',
        taskId: ctx.testRunId,
        iteration,
        durationMs: toolDurationMs,
        cost: { tokens: streamTokens },
      });

      messages.push({ role: 'assistant', content: JSON.stringify({ thought, toolCall }) });
      messages.push({ role: 'user', content: observation });

      // If load_skill (or any tool) added entries to ctx.loadedSkillBodies,
      // append those bodies to the system prompt so subsequent iterations
      // pick them up. Per-skill append is one-shot (tracked via appendedSkills)
      // so the system prompt only grows.
      if (ctx.loadedSkillBodies && ctx.loadedSkillBodies.size > appendedSkills.size) {
        for (const [name, body] of ctx.loadedSkillBodies) {
          if (appendedSkills.has(name)) continue;
          appendedSkills.add(name);
          messages[0].content = messages[0].content +
            `\n\n---\n\n## 已加载技能：${name}\n\n${body}`;
        }
      }
    }

    await this.writeTrace(ctx, 'max_iterations_reached', { maxIterations });
    const durationMs = Date.now() - startTime;
    this.emit({
      kind: 'task_finished',
      taskId: ctx.testRunId,
      success: false,
      reason: 'max_iterations_reached',
      durationMs,
      totalTokens,
    });

    return {
      success: false,
      finishedReason: 'max_iterations_reached',
      iterations: maxIterations,
      trace,
      totalTokens,
    };
  }

  private async writeTrace(ctx: HarnessContext, kind: string, payload: Record<string, unknown>) {
    try {
      await ctx.trace.write({
        id: ulid(),
        test_run_id: ctx.testRunId,
        parent_id: ctx.parentTraceId,
        kind: kind as any,
        name: kind,
        status: 'running',
        started_at: Date.now(),
        ended_at: Date.now(),
        payload,
      });
    } catch {
    }
  }
}

function createRequestSignal(parent: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal;
  cleanup: () => void;
  reason: () => string;
} {
  const controller = new AbortController();
  let reason = 'model_request_timeout';

  const abortFromParent = () => {
    reason = 'cancelled';
    controller.abort();
  };

  const timeout = setTimeout(() => {
    reason = 'model_request_timeout';
    controller.abort();
  }, timeoutMs);

  if (parent?.aborted) {
    abortFromParent();
  } else {
    parent?.addEventListener('abort', abortFromParent, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      parent?.removeEventListener('abort', abortFromParent);
    },
    reason: () => reason,
  };
}

function normalizeToolCall(toolCall: any): any {
  if (!toolCall || typeof toolCall !== 'object') {
    return toolCall;
  }

  const normalized = {
    ...toolCall,
    args: toolCall.args && typeof toolCall.args === 'object' ? { ...toolCall.args } : toolCall.args,
  };

  if (normalized.name === 'input_text' || normalized.name === 'type_text' || normalized.name === 'enter_text' || normalized.name === 'write') {
    normalized.name = 'type';
  }

  if (normalized.name === 'press_key' || normalized.name === 'key' || normalized.name === 'keypress' || normalized.name === 'shortcut') {
    normalized.name = 'hotkey';
  }

  if (normalized.name === 'take_screenshot' || normalized.name === 'capture' || normalized.name === 'snapshot') {
    normalized.name = 'screenshot';
  }

  if (normalized.name === 'left_double') {
    normalized.name = 'double_click';
  }
  if (normalized.name === 'right_single') {
    normalized.name = 'right_click';
  }
  if (normalized.name === 'left_click') {
    normalized.name = 'click';
  }

  if (
    normalized.name === 'stop' ||
    normalized.name === 'done' ||
    normalized.name === 'complete' ||
    normalized.name === 'task_complete' ||
    normalized.name === 'task_finished' ||
    normalized.name === 'finish'
  ) {
    const args = (normalized.args as Record<string, unknown>) ?? {};
    const status = args.status as string | undefined;
    const success = args.success;
    normalized.name = 'finished';
    normalized.args = {
      success: typeof success === 'boolean' ? success : status !== 'failed',
      reason: (args.reason as string) ?? (args.message as string) ?? '任务完成',
    };
  }

  if (
    (normalized.name === 'click' || normalized.name === 'double_click' || normalized.name === 'right_click') &&
    normalized.args &&
    typeof normalized.args === 'object'
  ) {
    const args = normalized.args as Record<string, unknown>;
    const coordinate = args.coordinate;
    if ((args.x === undefined || args.y === undefined) && Array.isArray(coordinate) && coordinate.length >= 2) {
      args.x = coordinate[0];
      args.y = coordinate[1];
    }
    const point = args.point;
    if ((args.x === undefined || args.y === undefined) && Array.isArray(point) && point.length >= 2) {
      args.x = point[0];
      args.y = point[1];
    }
  }

  return normalized;
}
