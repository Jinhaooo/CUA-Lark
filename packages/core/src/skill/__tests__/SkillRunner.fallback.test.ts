import { SkillRunner } from '../SkillRunner';
import { SkillRegistry, Context, SkillCall } from '../../types';
import { Verifier } from '../../verifier/Verifier';
import { JsonlTraceWriter } from '../../trace/JsonlTraceWriter';
import { defineSkill } from '../defineSkill';
import { z } from 'zod';

describe('SkillRunner fallback', () => {
  let runner: SkillRunner;
  let mockRegistry: jest.Mocked<SkillRegistry>;
  let mockVerifier: jest.Mocked<Verifier>;
  let mockTrace: jest.Mocked<JsonlTraceWriter>;
  let mockContext: Context;

  beforeEach(() => {
    mockRegistry = {
      get: jest.fn(),
      register: jest.fn(),
      list: jest.fn(),
      loadFromFs: jest.fn()
    } as any;

    mockVerifier = {
      run: jest.fn()
    } as any;

    mockTrace = {
      beginRun: jest.fn().mockReturnValue('test-run-id'),
      write: jest.fn(),
      endRun: jest.fn(),
      saveScreenshot: jest.fn()
    } as any;

    mockContext = {
      operator: {},
      agent: {},
      registry: mockRegistry,
      model: {},
      trace: mockTrace,
      ocr: null,
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      },
      config: {},
      snapshot: jest.fn(),
      runSkill: jest.fn()
    } as any;

    runner = new SkillRunner(mockRegistry, mockVerifier, mockTrace);
  });

  test('should use fallback skill when primary skill fails', async () => {
    const primarySkill = defineSkill({
      name: 'primary-skill',
      kind: 'agent_driven',
      description: 'Primary skill',
      manual: 'Manual test',
      params: z.object({}),
      fallback: 'fallback-skill',
      execute: async () => {
        throw new Error('Primary skill failed');
      }
    });

    const fallbackSkill = defineSkill({
      name: 'fallback-skill',
      kind: 'agent_driven',
      description: 'Fallback skill',
      manual: 'Manual test',
      params: z.object({}),
      execute: async () => ({ result: 'fallback success' })
    });

    mockRegistry.get.mockImplementation((name: string) => {
      if (name === 'primary-skill') return primarySkill;
      if (name === 'fallback-skill') return fallbackSkill;
      return undefined;
    });

    const call: SkillCall = {
      skill: 'primary-skill',
      params: {}
    };

    const result = await runner.run(call, mockContext);

    expect(result.passed).toBe(true);
    expect(result.skillName).toBe('fallback-skill');
    expect(result.fallbackUsed).toBe('fallback-skill');
    expect(mockContext.logger.warn).toHaveBeenCalledWith('Falling back to fallback-skill');
  });

  test('should not use fallback if already in fallback context', async () => {
    const skillC = defineSkill({
      name: 'skill-c',
      kind: 'agent_driven',
      description: 'Skill C',
      manual: 'Manual test',
      params: z.object({}),
      fallback: 'skill-d',
      execute: async () => {
        throw new Error('Skill C failed');
      }
    });

    const skillD = defineSkill({
      name: 'skill-d',
      kind: 'agent_driven',
      description: 'Skill D',
      manual: 'Manual test',
      params: z.object({}),
      fallback: 'skill-e',
      execute: async () => {
        throw new Error('Skill D failed');
      }
    });

    mockRegistry.get.mockImplementation((name: string) => {
      if (name === 'skill-c') return skillC;
      if (name === 'skill-d') return skillD;
      return undefined;
    });

    const call: SkillCall = {
      skill: 'skill-c',
      params: {}
    };

    const result = await runner.run(call, mockContext);

    expect(result.passed).toBe(false);
    expect(result.skillName).toBe('skill-d');
    expect(result.fallbackUsed).toBe('skill-d');
    // 验证没有继续fallback到skill-e
    expect(mockRegistry.get).toHaveBeenCalledWith('skill-c');
    expect(mockRegistry.get).toHaveBeenCalledWith('skill-d');
    expect(mockRegistry.get).not.toHaveBeenCalledWith('skill-e');
  });

  test('should handle fallback skill not found', async () => {
    const primarySkill = defineSkill({
      name: 'primary-skill',
      kind: 'agent_driven',
      description: 'Primary skill',
      manual: 'Manual test',
      params: z.object({}),
      fallback: 'non-existent-fallback',
      execute: async () => {
        throw new Error('Primary skill failed');
      }
    });

    mockRegistry.get.mockImplementation((name: string) => {
      if (name === 'primary-skill') return primarySkill;
      return undefined;
    });

    const call: SkillCall = {
      skill: 'primary-skill',
      params: {}
    };

    await expect(runner.run(call, mockContext)).rejects.toThrow('Skill not found: non-existent-fallback');
  });
});