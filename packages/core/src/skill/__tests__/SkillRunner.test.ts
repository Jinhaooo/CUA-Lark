import { SkillRunner } from '../SkillRunner';
import { SkillRegistry, Context, SkillCall, VerifyResult } from '../../types';
import { Verifier } from '../../verifier/Verifier';
import { JsonlTraceWriter } from '../../_deprecated/trace/JsonlTraceWriter';
import { defineSkill } from '../defineSkill';
import { z } from 'zod';

describe('SkillRunner', () => {
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
      operator: {
        setActionVerifier: jest.fn(),
        setActionVerifyEnabled: jest.fn(),
        setTraceContext: jest.fn()
      },
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

  test('should execute skill successfully', async () => {
    const skill = defineSkill({
      name: 'test-skill',
      kind: 'agent_driven',
      description: 'Test skill',
      manual: 'Manual test',
      params: z.object({}),
      execute: async () => ({ result: 'success' }),
      verify: async () => ({ passed: true, reason: 'Verification passed' })
    });

    mockRegistry.get.mockReturnValue(skill);
    mockVerifier.run.mockResolvedValue({ passed: true, reason: 'Verification passed' });

    const call: SkillCall = {
      skill: 'test-skill',
      params: {}
    };

    const result = await runner.run(call, mockContext);

    expect(result.passed).toBe(true);
    expect(result.skillName).toBe('test-skill');
    expect(mockTrace.write).toHaveBeenCalled();
  });

  test('should handle precondition failure', async () => {
    const skill = defineSkill({
      name: 'test-skill',
      kind: 'agent_driven',
      description: 'Test skill',
      manual: 'Manual test',
      params: z.object({}),
      preconditions: [
        async () => false
      ],
      execute: async () => ({ result: 'success' })
    });

    mockRegistry.get.mockReturnValue(skill);

    const call: SkillCall = {
      skill: 'test-skill',
      params: {}
    };

    const result = await runner.run(call, mockContext);

    expect(result.passed).toBe(false);
    expect(result.error?.kind).toBe('precondition_unmet');
  });

  test('should handle execute failure', async () => {
    const skill = defineSkill({
      name: 'test-skill',
      kind: 'agent_driven',
      description: 'Test skill',
      manual: 'Manual test',
      params: z.object({}),
      execute: async () => {
        throw new Error('Execute failed');
      }
    });

    mockRegistry.get.mockReturnValue(skill);

    const call: SkillCall = {
      skill: 'test-skill',
      params: {}
    };

    const result = await runner.run(call, mockContext);

    expect(result.passed).toBe(false);
    expect(result.error?.kind).toBe('unknown');
  });

  test('should handle verify failure', async () => {
    const skill = defineSkill({
      name: 'test-skill',
      kind: 'agent_driven',
      description: 'Test skill',
      manual: 'Manual test',
      params: z.object({}),
      execute: async () => ({ result: 'success' }),
      verify: async () => ({ passed: false, reason: 'Verification failed' })
    });

    mockRegistry.get.mockReturnValue(skill);

    const call: SkillCall = {
      skill: 'test-skill',
      params: {}
    };

    const result = await runner.run(call, mockContext);

    expect(result.passed).toBe(false);
    expect(result.error?.kind).toBe('verify_failed');
  });

  test('should handle skill not found', async () => {
    mockRegistry.get.mockReturnValue(undefined);

    const call: SkillCall = {
      skill: 'non-existent-skill',
      params: {}
    };

    await expect(runner.run(call, mockContext)).rejects.toThrow('Skill not found: non-existent-skill');
  });
});