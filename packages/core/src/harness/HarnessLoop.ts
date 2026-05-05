import type { SkillTemplate, HarnessResult, HarnessTrace, HarnessContext } from './types.js';
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
    return this.runInternal(template, ctx, signal, 0);
  }

  private async runInternal(
    template: SkillTemplate,
    ctx: HarnessContext,
    signal: AbortSignal | undefined,
    selfHealingRetryCount: number
  ): Promise<HarnessResult> {
    const trace: HarnessTrace[] = [];
    let totalTokens = 0;
    const systemPrompt = new PromptBuilder(this.toolRegistry).build(template);
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
            signal: requestSignal.signal,
          };

          if (typeof ctx.model.chatVisionStream === 'function') {
            try {
              for await (const chunk of ctx.model.chatVisionStream(visionRequest)) {
                if (requestSignal.signal.aborted) {
                  throw new Error(requestSignal.reason());
                }
                // Reasoning models (qwen3.x reasoning / deepseek-r1 等) 把 CoT
                // 放在 reasoning_content。前端展示需要它，但不能混入 thought
                // 缓冲（否则后续 JSON 解析失败）。
                const reasoningDelta = (chunk as { reasoningDelta?: string }).reasoningDelta;
                if (reasoningDelta) {
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
            parsedResponse = JSON.parse(thought);
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
            this.emit({
              kind: 'model_request_finished',
              taskId: ctx.testRunId,
              iteration,
              attempt: retry + 1,
              durationMs: Date.now() - modelStartedAt,
              success: false,
              reason: 'invalid_json',
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

      const toolStartTime = Date.now();
      let observation: string;
      let success = true;

      try {
        if (toolCall.name === 'call_user') {
          throw new CallUserRequired(toolCall.args?.question || '');
        }

        const tool = this.toolRegistry.get(toolCall.name);
        if (!tool || (template.toolWhitelist && !template.toolWhitelist.includes(toolCall.name))) {
          const availableNames = this.toolRegistry
            .list({ whitelist: template.toolWhitelist })
            .map((t) => t.name);
          observation =
            `工具调用错误：不存在名为 "${toolCall.name}" 的工具。\n` +
            `你只能从以下已注册工具中选择（必须严格匹配名称）：\n${availableNames.map((n) => `- ${n}`).join('\n')}\n` +
            `请重新选择一个上面列出的工具，并用 {"thought":"...","tool_call":{"name":"<上面工具名>","args":{...}}} 重发。如果任务已完成，必须调用 finished。`;
          success = false;
        } else {
          const args = tool.argsSchema.parse(toolCall.args ?? {});
          const result = tool.category === 'meta' || this.riskGate.shouldSkipRiskGate(template.name)
            ? await tool.execute(ctx as any, args)
            : await this.riskGate.executeWithRiskGate(tool, ctx as any, args, this.eventBus);
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
