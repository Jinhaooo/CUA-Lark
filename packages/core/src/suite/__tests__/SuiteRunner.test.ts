import { SuiteRunner } from '../SuiteRunner';
import { SkillRunner, Context } from '../../types';
import { writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('SuiteRunner', () => {
  const testDir = './test-suite';
  const testConfigPath = './configs/test-targets.yaml';

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    if (existsSync(testConfigPath)) {
      rmSync(testConfigPath);
    }

    // Create test directory
    require('fs').mkdirSync(testDir, { recursive: true });

    // Create config file
    require('fs').mkdirSync('./configs', { recursive: true });
    writeFileSync(testConfigPath, `
im:
  test_group:
    name_pattern: "CUA-Lark-Test"
    expected_member_count: 2
`);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    if (existsSync(testConfigPath)) {
      rmSync(testConfigPath);
    }
  });

  test('should run test cases with skillCalls', async () => {
    // Create test case file
    writeFileSync(join(testDir, 'test1.yaml'), `
id: test1
title: Test 1
tags: [test]
timeoutSeconds: 10
expectations:
  - Test passes
skillCalls:
  - skill: test-skill
    params: {}
`);

    const mockSkillRunner = {
      run: jest.fn().mockResolvedValue({ passed: true, skillName: 'test-skill', traceId: 'test-trace' })
    } as any;

    const mockContext = {
      operator: {},
      agent: {},
      registry: {},
      model: {},
      trace: {
        beginRun: jest.fn(),
        write: jest.fn(),
        endRun: jest.fn(),
        saveScreenshot: jest.fn()
      },
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
    } as Context;

    const runner = new SuiteRunner(mockSkillRunner, mockContext);
    const result = await runner.run(`${testDir}/*.yaml`);

    expect(result.total).toBe(1);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockSkillRunner.run).toHaveBeenCalled();
  });

  test('should throw error for instruction-based test cases', async () => {
    // Create test case file with instruction
    writeFileSync(join(testDir, 'test2.yaml'), `
id: test2
title: Test 2
tags: [test]
timeoutSeconds: 10
expectations:
  - Test passes
instruction: "Test instruction"
`);

    const mockSkillRunner = {
      run: jest.fn()
    } as any;

    const mockContext = {
      operator: {},
      agent: {},
      registry: {},
      model: {},
      trace: {
        beginRun: jest.fn(),
        write: jest.fn(),
        endRun: jest.fn(),
        saveScreenshot: jest.fn()
      },
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
    } as Context;

    const runner = new SuiteRunner(mockSkillRunner, mockContext);
    const result = await runner.run(`${testDir}/*.yaml`);

    expect(result.total).toBe(1);
    expect(result.passed).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.cases[0].error).toBe('SkillPlanner is M3+ feature');
  });

  test('should throw error for test cases with neither skillCalls nor instruction', async () => {
    // Create test case file with neither skillCalls nor instruction
    writeFileSync(join(testDir, 'test3.yaml'), `
id: test3
title: Test 3
tags: [test]
timeoutSeconds: 10
expectations:
  - Test passes
`);

    const mockSkillRunner = {
      run: jest.fn()
    } as any;

    const mockContext = {
      operator: {},
      agent: {},
      registry: {},
      model: {},
      trace: {
        beginRun: jest.fn(),
        write: jest.fn(),
        endRun: jest.fn(),
        saveScreenshot: jest.fn()
      },
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
    } as Context;

    const runner = new SuiteRunner(mockSkillRunner, mockContext);
    const result = await runner.run(`${testDir}/*.yaml`);

    expect(result.total).toBe(1);
    expect(result.passed).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.cases[0].error).toBe('Test case must have either skillCalls or instruction');
  });
});