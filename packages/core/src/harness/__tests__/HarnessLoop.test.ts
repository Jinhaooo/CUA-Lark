import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { HarnessLoop } from '../HarnessLoop.js';
import { ToolRegistry } from '../../tools/ToolRegistry.js';
import type { SkillTemplate, HarnessContext } from '../types.js';

function createTemplate(overrides: Partial<SkillTemplate> = {}): SkillTemplate {
  return {
    name: 'test.skill',
    description: 'Test skill',
    systemPrompt: 'Do the test task.',
    finishCriteria: 'Call finished when done.',
    maxLoopIterations: 5,
    ...overrides,
  };
}

function createContext(responses: string[]): HarnessContext {
  const chatVision = vi.fn(async () => ({
    content: responses.shift() ?? JSON.stringify({ thought: 'done', tool_call: { name: 'finished', args: { success: true, reason: 'done' } } }),
    usage: { totalTokens: 10, promptTokens: 5, completionTokens: 5 },
  }));

  return {
    operator: {
      screenshot: vi.fn(async () => ({ base64: Buffer.from('png').toString('base64') })),
    },
    model: { chatVision },
    trace: { write: vi.fn(async () => {}) },
    testRunId: 'run-1',
    parentTraceId: 'parent-1',
    iteration: 0,
    params: { marker: 'real-context' },
    config: {
      maxLoopIterations: 5,
      maxTokensPerSkill: 1000,
      messageHistoryLimit: 5,
      loopDetectionThreshold: 3,
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}

describe('HarnessLoop', () => {
  it('dispatches tools through the injected registry with the active harness context', async () => {
    const registry = new ToolRegistry();
    const execute = vi.fn(async (ctx: HarnessContext, args: { value: string }) => ({
      success: true,
      observation: `saw ${ctx.params.marker} and ${args.value}`,
    }));
    registry.register({
      name: 'record_evidence',
      description: 'Record evidence',
      argsSchema: z.object({ value: z.string() }),
      execute: execute as any,
      category: 'meta',
      costHint: 'free',
    });

    const loop = new HarnessLoop(registry);
    const ctx = createContext([
      JSON.stringify({ thought: 'record', tool_call: { name: 'record_evidence', args: { value: 'payload' } } }),
      JSON.stringify({ thought: 'done', tool_call: { name: 'finished', args: { success: true, reason: 'ok' } } }),
    ]);

    const result = await loop.run(createTemplate({ toolWhitelist: ['record_evidence', 'finished'] }), ctx);

    expect(result.success).toBe(true);
    expect(result.finishedReason).toBe('ok');
    expect(execute).toHaveBeenCalledOnce();
    expect(result.trace[0]?.observation).toBe('saw real-context and payload');
  });

  it('falls back to reasoning_content when content is empty (GLM-5V / deepseek-r1)', async () => {
    const registry = new ToolRegistry();
    const loop = new HarnessLoop(registry);
    // Simulate a reasoning-only stream: chatVisionStream yields chunks where
    // `delta` is empty but `reasoningDelta` carries the entire response.
    const reasoningPayload = 'I need to finish.\n\n```json\n' +
      JSON.stringify({ thought: 'reasoning', tool_call: { name: 'finished', args: { success: true, reason: 'reasoning ok' } } }) +
      '\n```';
    const chatVisionStream = vi.fn(async function* () {
      yield { delta: '', reasoningDelta: reasoningPayload, done: false };
      yield { delta: '', done: true };
    });
    const ctx: any = {
      operator: { screenshot: vi.fn(async () => ({ base64: 'AA==' })) },
      model: { chatVisionStream, chatVision: vi.fn(async () => ({ content: '', usage: { totalTokens: 0, promptTokens: 0, completionTokens: 0 } })) },
      trace: { write: vi.fn(async () => {}) },
      testRunId: 'run-r',
      parentTraceId: 'parent-r',
      iteration: 0,
      params: {},
      config: { maxLoopIterations: 5, maxTokensPerSkill: 1000, messageHistoryLimit: 5, loopDetectionThreshold: 3 },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };
    const result = await loop.run(createTemplate({ toolWhitelist: ['finished'] }), ctx);
    expect(result.success).toBe(true);
    expect(result.finishedReason).toBe('reasoning ok');
  });

  it('parses ```json-fenced model responses (GLM-5V tolerance)', async () => {
    const registry = new ToolRegistry();
    const loop = new HarnessLoop(registry);
    const ctx = createContext([
      '```json\n' + JSON.stringify({ thought: 'fenced', tool_call: { name: 'finished', args: { success: true, reason: 'fenced ok' } } }) + '\n```',
    ]);

    const result = await loop.run(createTemplate({ toolWhitelist: ['finished'] }), ctx);
    expect(result.success).toBe(true);
    expect(result.finishedReason).toBe('fenced ok');
  });

  it('parses model responses with leading prose (extract first/last brace)', async () => {
    const registry = new ToolRegistry();
    const loop = new HarnessLoop(registry);
    const ctx = createContext([
      'Here is my response:\n' + JSON.stringify({ thought: 'prose', tool_call: { name: 'finished', args: { success: true, reason: 'prose ok' } } }) + '\nHope this helps.',
    ]);

    const result = await loop.run(createTemplate({ toolWhitelist: ['finished'] }), ctx);
    expect(result.success).toBe(true);
    expect(result.finishedReason).toBe('prose ok');
  });

  it('fails unavailable tools without executing them', async () => {
    const registry = new ToolRegistry();
    const execute = vi.fn();
    registry.register({
      name: 'click',
      description: 'Click',
      argsSchema: z.object({ x: z.number(), y: z.number() }),
      execute,
      category: 'act',
      costHint: 'free',
    });

    const loop = new HarnessLoop(registry);
    const ctx = createContext([
      JSON.stringify({ thought: 'click', tool_call: { name: 'click', args: { x: 1, y: 2 } } }),
      JSON.stringify({ thought: 'done', tool_call: { name: 'finished', args: { success: false, reason: 'blocked' } } }),
    ]);

    const result = await loop.run(createTemplate({ toolWhitelist: ['finished'] }), ctx);

    expect(result.success).toBe(false);
    // M6 hallucination-prevention: corrective Chinese observation listing the
    // actual whitelist + counter ("第 1 次连续错调"). The old M3.5 message
    // 'Unknown or unavailable tool: click' was replaced when the
    // tool_hallucination_detected fail-fast path landed.
    expect(result.trace[0]?.observation).toContain('不存在名为 "click" 的工具');
    expect(result.trace[0]?.observation).toContain('合法工具名');
    expect(execute).not.toHaveBeenCalled();
  });
});
