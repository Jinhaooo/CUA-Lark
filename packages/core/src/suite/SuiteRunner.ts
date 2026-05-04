import { glob } from 'glob';
import type { Context } from '../types.js';
import type { SkillRunner } from '../skill/SkillRunner.js';
import type { SuiteResult, TestCaseFile } from './types.js';
import { YamlLoader } from './yamlLoader.js';
import { ConfigLoader } from './ConfigLoader.js';
import type { SkillPlanner } from '../_deprecated/planner/SkillPlanner.js';

export class SuiteRunner {
  private skillRunner: SkillRunner;
  private context: Context;
  private yamlLoader: YamlLoader;
  private skillPlanner: SkillPlanner | null = null;

  constructor(skillRunner: SkillRunner, context: Context) {
    this.skillRunner = skillRunner;
    this.context = context;
    this.yamlLoader = new YamlLoader(new ConfigLoader());
  }

  setSkillPlanner(planner: SkillPlanner): void {
    this.skillPlanner = planner;
  }

  async run(globPattern: string): Promise<SuiteResult> {
    const testFiles = await glob(globPattern);
    const results: SuiteResult['cases'] = [];
    const startTime = Date.now();

    for (const file of testFiles) {
      results.push(await this.runTestCase(file));
    }

    const durationMs = Date.now() - startTime;
    const passed = results.filter((result) => result.passed).length;
    const skipped = results.filter((result) => result.skipped).length;
    const failed = results.length - passed - skipped;

    return {
      total: results.length,
      passed,
      failed,
      skipped,
      durationMs,
      cases: results,
    };
  }

  private async runTestCase(filePath: string): Promise<SuiteResult['cases'][0]> {
    const startTime = Date.now();
    let testCase: TestCaseFile | null = null;
    let mainError: unknown = null;

    try {
      testCase = this.yamlLoader.load(filePath);
      testCase.file = filePath;

      await this.runPhaseSkillCalls(testCase, 'setup');
      await this.runMain(testCase);

      return {
        id: testCase.id ?? filePath,
        passed: true,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      mainError = error;
      return {
        id: testCase?.id ?? filePath,
        passed: false,
        skipped: this.isSetupError(error),
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      };
    } finally {
      if (testCase) {
        await this.runPhaseSkillCalls(testCase, 'teardown', mainError);
      }
    }
  }

  private async runMain(testCase: TestCaseFile): Promise<void> {
    if (testCase.skillCalls) {
      await this.runSkillCalls(testCase);
      return;
    }

    if (testCase.instruction) {
      if (!this.skillPlanner) {
        throw new Error('SkillPlanner not configured');
      }

      const calls = await this.skillPlanner.plan(testCase.instruction, {
        testCaseId: testCase.id,
        configValues: this.context.config,
      });
      await this.runSkillCalls({ ...testCase, skillCalls: calls });
      return;
    }

    throw new Error('Test case must have either skillCalls or instruction');
  }

  private async runPhaseSkillCalls(
    testCase: TestCaseFile,
    phase: 'setup' | 'teardown',
    mainError?: unknown,
  ): Promise<void> {
    const calls = phase === 'setup' ? testCase.setup_skills : testCase.teardown_skills;
    if (!calls || calls.length === 0) {
      return;
    }

    try {
      await this.runSkillCalls({ ...testCase, skillCalls: calls });
    } catch (error) {
      if (phase === 'setup') {
        throw new Error(`Setup failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      this.context.logger.warn(
        `Teardown failed for ${testCase.id ?? testCase.file ?? 'unknown test case'}:`,
        error instanceof Error ? error.message : String(error),
        mainError ? '(main test had already failed)' : '',
      );
    }
  }

  private isSetupError(error: unknown): boolean {
    return error instanceof Error && error.message.startsWith('Setup failed:');
  }

  private async runSkillCalls(testCase: TestCaseFile): Promise<void> {
    if (!testCase.skillCalls) return;

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Test case timeout after ${testCase.timeoutSeconds || 60} seconds`));
      }, (testCase.timeoutSeconds || 60) * 1000);
    });

    const executionPromise = async () => {
      for (const call of testCase.skillCalls!) {
        const result = await this.skillRunner.run(call, this.context);
        if (!result.passed) {
          throw result.error || new Error(`Skill failed: ${call.skill}`);
        }
      }
    };

    await Promise.race([executionPromise(), timeoutPromise]);
  }
}
