import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from '../ToolRegistry.js';
import type { Tool, HarnessContext } from '../types.js';

const createMockContext = (): HarnessContext => ({
  operator: {} as any,
  model: {} as any,
  trace: {} as any,
  testRunId: 'test-run-id',
  parentTraceId: 'parent-trace-id',
  iteration: 0,
  params: {},
  config: {
    maxLoopIterations: 30,
    maxTokensPerSkill: 120000,
    messageHistoryLimit: 5,
    loopDetectionThreshold: 3,
  },
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
  },
});

describe('ToolRegistry', () => {
  describe('register', () => {
    it('should register a tool', () => {
      const registry = new ToolRegistry();
      const tool: Tool = {
        name: 'test_tool',
        description: 'A test tool',
        argsSchema: z.object({}),
        execute: async () => ({ success: true, observation: 'test' }),
        category: 'act',
        costHint: 'free',
      };

      registry.register(tool);

      expect(registry.get('test_tool')).toEqual(tool);
    });

    it('should override existing tool with same name', () => {
      const registry = new ToolRegistry();
      const tool1: Tool = {
        name: 'test_tool',
        description: 'First version',
        argsSchema: z.object({}),
        execute: async () => ({ success: true, observation: 'v1' }),
        category: 'act',
        costHint: 'free',
      };
      const tool2: Tool = {
        name: 'test_tool',
        description: 'Second version',
        argsSchema: z.object({}),
        execute: async () => ({ success: true, observation: 'v2' }),
        category: 'act',
        costHint: 'cheap',
      };

      registry.register(tool1);
      registry.register(tool2);

      expect(registry.get('test_tool')?.description).toBe('Second version');
      expect(registry.get('test_tool')?.costHint).toBe('cheap');
    });
  });

  describe('get', () => {
    it('should return undefined for non-existent tool', () => {
      const registry = new ToolRegistry();
      expect(registry.get('non_existent')).toBeUndefined();
    });

    it('should return the registered tool', () => {
      const registry = new ToolRegistry();
      const tool: Tool = {
        name: 'my_tool',
        description: 'My tool',
        argsSchema: z.object({ id: z.string() }),
        execute: async () => ({ success: true, observation: 'done' }),
        category: 'perceive',
        costHint: 'cheap',
      };

      registry.register(tool);

      expect(registry.get('my_tool')).toBe(tool);
    });
  });

  describe('list', () => {
    it('should return all tools when no filter', () => {
      const registry = new ToolRegistry();
      const tool1: Tool = {
        name: 'tool1',
        description: 'Tool 1',
        argsSchema: z.object({}),
        execute: async () => ({ success: true, observation: 't1' }),
        category: 'act',
        costHint: 'free',
      };
      const tool2: Tool = {
        name: 'tool2',
        description: 'Tool 2',
        argsSchema: z.object({}),
        execute: async () => ({ success: true, observation: 't2' }),
        category: 'perceive',
        costHint: 'cheap',
      };

      registry.register(tool1);
      registry.register(tool2);

      expect(registry.list()).toHaveLength(2);
    });

    it('should filter by category', () => {
      const registry = new ToolRegistry();
      const actTool: Tool = {
        name: 'act_tool',
        description: 'Act tool',
        argsSchema: z.object({}),
        execute: async () => ({ success: true, observation: 'act' }),
        category: 'act',
        costHint: 'free',
      };
      const perceiveTool: Tool = {
        name: 'perceive_tool',
        description: 'Perceive tool',
        argsSchema: z.object({}),
        execute: async () => ({ success: true, observation: 'perceive' }),
        category: 'perceive',
        costHint: 'cheap',
      };

      registry.register(actTool);
      registry.register(perceiveTool);

      expect(registry.list({ category: 'act' })).toEqual([actTool]);
      expect(registry.list({ category: 'perceive' })).toEqual([perceiveTool]);
    });

    it('should filter by whitelist', () => {
      const registry = new ToolRegistry();
      const tool1: Tool = {
        name: 'tool1',
        description: 'Tool 1',
        argsSchema: z.object({}),
        execute: async () => ({ success: true, observation: 't1' }),
        category: 'act',
        costHint: 'free',
      };
      const tool2: Tool = {
        name: 'tool2',
        description: 'Tool 2',
        argsSchema: z.object({}),
        execute: async () => ({ success: true, observation: 't2' }),
        category: 'perceive',
        costHint: 'cheap',
      };
      const tool3: Tool = {
        name: 'tool3',
        description: 'Tool 3',
        argsSchema: z.object({}),
        execute: async () => ({ success: true, observation: 't3' }),
        category: 'verify',
        costHint: 'expensive',
      };

      registry.register(tool1);
      registry.register(tool2);
      registry.register(tool3);

      expect(registry.list({ whitelist: ['tool1', 'tool3'] })).toEqual([tool1, tool3]);
    });

    it('should combine category and whitelist filters', () => {
      const registry = new ToolRegistry();
      const actTool1: Tool = {
        name: 'act1',
        description: 'Act 1',
        argsSchema: z.object({}),
        execute: async () => ({ success: true, observation: 'a1' }),
        category: 'act',
        costHint: 'free',
      };
      const actTool2: Tool = {
        name: 'act2',
        description: 'Act 2',
        argsSchema: z.object({}),
        execute: async () => ({ success: true, observation: 'a2' }),
        category: 'act',
        costHint: 'free',
      };
      const perceiveTool: Tool = {
        name: 'perceive1',
        description: 'Perceive 1',
        argsSchema: z.object({}),
        execute: async () => ({ success: true, observation: 'p1' }),
        category: 'perceive',
        costHint: 'cheap',
      };

      registry.register(actTool1);
      registry.register(actTool2);
      registry.register(perceiveTool);

      expect(registry.list({ category: 'act', whitelist: ['act1', 'perceive1'] })).toEqual([actTool1]);
    });
  });

  describe('toSystemPromptSection', () => {
    it('should return empty string when no tools', () => {
      const registry = new ToolRegistry();
      expect(registry.toSystemPromptSection()).toBe('');
    });

    it('should generate system prompt section with tools', () => {
      const registry = new ToolRegistry();
      const tool: Tool = {
        name: 'click',
        description: 'Click at coordinates',
        argsSchema: z.object({ x: z.number(), y: z.number() }),
        execute: async () => ({ success: true, observation: 'clicked' }),
        category: 'act',
        costHint: 'free',
      };

      registry.register(tool);

      const section = registry.toSystemPromptSection();

      expect(section).toContain('click(x: <value>, y: <value>)');
      expect(section).toContain('Click at coordinates');
      expect(section).toContain('{"thought": "your reasoning", "tool_call": {"name": "tool_name", "args": {...}}}');
    });

    it('should respect whitelist in system prompt', () => {
      const registry = new ToolRegistry();
      const tool1: Tool = {
        name: 'tool1',
        description: 'Tool 1',
        argsSchema: z.object({}),
        execute: async () => ({ success: true, observation: 't1' }),
        category: 'act',
        costHint: 'free',
      };
      const tool2: Tool = {
        name: 'tool2',
        description: 'Tool 2',
        argsSchema: z.object({}),
        execute: async () => ({ success: true, observation: 't2' }),
        category: 'perceive',
        costHint: 'cheap',
      };

      registry.register(tool1);
      registry.register(tool2);

      const section = registry.toSystemPromptSection(['tool1']);

      expect(section).toContain('tool1');
      expect(section).not.toContain('tool2');
    });
  });
});