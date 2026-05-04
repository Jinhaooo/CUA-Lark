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
    expect(result.cases[0].error).toBe('SkillPlanner not configured');
  });

  test('should run setup and warn on teardown failure without overriding main result', async () => {
    writeFileSync(join(testDir, 'test-teardown.yaml'), `
id: test_teardown
title: Teardown warning
tags: [test]
timeoutSeconds: 10
setup_skills:
  - skill: setup-skill
    params: {}
skillCalls:
  - skill: main-skill
    params: {}
teardown_skills:
  - skill: teardown-skill
    params: {}
`);

    const mockSkillRunner = {
      run: jest.fn().mockImplementation((call) => {
        if (call.skill === 'teardown-skill') {
          return Promise.resolve({
            passed: false,
            skillName: call.skill,
            traceId: 'teardown-trace',
            error: new Error('teardown failed'),
          });
        }

        return Promise.resolve({ passed: true, skillName: call.skill, traceId: `${call.skill}-trace` });
      }),
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
        saveScreenshot: jest.fn(),
      },
      ocr: null,
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
      config: {},
      snapshot: jest.fn(),
      runSkill: jest.fn(),
    } as Context;

    const runner = new SuiteRunner(mockSkillRunner, mockContext);
    const result = await runner.run(`${testDir}/*.yaml`);

    expect(result.total).toBe(1);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockSkillRunner.run).toHaveBeenNthCalledWith(1, { skill: 'setup-skill', params: {} }, mockContext);
    expect(mockSkillRunner.run).toHaveBeenNthCalledWith(2, { skill: 'main-skill', params: {} }, mockContext);
    expect(mockSkillRunner.run).toHaveBeenNthCalledWith(3, { skill: 'teardown-skill', params: {} }, mockContext);
    expect(mockContext.logger.warn).toHaveBeenCalledWith(
      'Teardown failed for test_teardown:',
      'teardown failed',
      '',
    );
  });

  test('should mark setup failure as skipped and still run teardown', async () => {
    writeFileSync(join(testDir, 'test-setup-fail.yaml'), `
id: test_setup_fail
title: Setup failure
tags: [test]
timeoutSeconds: 10
setup_skills:
  - skill: setup-skill
    params: {}
skillCalls:
  - skill: main-skill
    params: {}
teardown_skills:
  - skill: teardown-skill
    params: {}
`);

    const mockSkillRunner = {
      run: jest.fn().mockImplementation((call) => {
        if (call.skill === 'setup-skill') {
          return Promise.resolve({
            passed: false,
            skillName: call.skill,
            traceId: 'setup-trace',
            error: new Error('setup failed'),
          });
        }

        return Promise.resolve({ passed: true, skillName: call.skill, traceId: `${call.skill}-trace` });
      }),
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
        saveScreenshot: jest.fn(),
      },
      ocr: null,
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
      config: {},
      snapshot: jest.fn(),
      runSkill: jest.fn(),
    } as Context;

    const runner = new SuiteRunner(mockSkillRunner, mockContext);
    const result = await runner.run(`${testDir}/*.yaml`);

    expect(result.total).toBe(1);
    expect(result.passed).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.cases[0].skipped).toBe(true);
    expect(mockSkillRunner.run).toHaveBeenCalledWith({ skill: 'teardown-skill', params: {} }, mockContext);
    expect(mockSkillRunner.run).not.toHaveBeenCalledWith({ skill: 'main-skill', params: {} }, mockContext);
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
