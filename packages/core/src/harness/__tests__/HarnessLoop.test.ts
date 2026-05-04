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
    expect(result.trace[0]?.observation).toBe('Unknown or unavailable tool: click');
    expect(execute).not.toHaveBeenCalled();
  });
});
