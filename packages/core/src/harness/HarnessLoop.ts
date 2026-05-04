import type { SkillTemplate, HarnessResult, HarnessTrace, HarnessContext } from './types.js';
import type { ToolRegistry } from '../tools/types.js';
import { CallUserRequired } from './types.js';
import { ulid } from 'ulid';
import { ZodError } from 'zod';
import type { EventBus } from '../trace/EventBus.js';
import { StreamInterrupted } from '../model/streaming.js';

export class HarnessLoop {
  private toolRegistry: ToolRegistry;
  private eventBus?: EventBus;

  constructor(toolRegistry: ToolRegistry, eventBus?: EventBus) {
    this.toolRegistry = toolRegistry;
    this.eventBus = eventBus;
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
    const trace: HarnessTrace[] = [];
    let totalTokens = 0;
    const messages: any[] = [{ role: 'system', content: template.systemPrompt }];
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
          { type: 'text', text: 'What should I do next? Output in JSON format with thought and tool_call.' },
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

          const visionRequest = {
            messages: [...recentMessages, userMessage],
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

        const durationMs = Date.now() - startTime;
        this.emit({
          kind: 'task_finished',
          taskId: ctx.testRunId,
          success: toolCall.args?.success === true,
          reason: toolCall.args?.reason || 'finished',
          durationMs,
          totalTokens,
        });

        return {
          success: toolCall.args?.success === true,
          finishedReason: toolCall.args?.reason || 'finished',
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

      const toolStartTime = Date.now();
      let observation: string;
      let success = true;

      try {
        if (toolCall.name === 'call_user') {
          throw new CallUserRequired(toolCall.args?.question || '');
        }

        const tool = this.toolRegistry.get(toolCall.name);
        if (!tool || (template.toolWhitelist && !template.toolWhitelist.includes(toolCall.name))) {
          observation = `Unknown or unavailable tool: ${toolCall.name}`;
          success = false;
        } else {
          const args = tool.argsSchema.parse(toolCall.args ?? {});
          const result = await tool.execute(ctx as any, args);
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

  if (normalized.name === 'input_text' || normalized.name === 'type_text') {
    normalized.name = 'type';
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
