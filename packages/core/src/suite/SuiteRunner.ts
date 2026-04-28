import type { Context } from '../types.js';
import type { SkillRunner } from '../skill/SkillRunner.js';
import type { SuiteResult, TestCaseFile } from './types.js';
import { YamlLoader } from './yamlLoader.js';
import { ConfigLoader } from './ConfigLoader.js';
import { glob } from 'glob';

export class SuiteRunner {
  private skillRunner: SkillRunner;
  private context: Context;
  private yamlLoader: YamlLoader;

  constructor(skillRunner: SkillRunner, context: Context) {
    this.skillRunner = skillRunner;
    this.context = context;
    this.yamlLoader = new YamlLoader(new ConfigLoader());
  }

  async run(globPattern: string): Promise<SuiteResult> {
    const testFiles = await glob(globPattern);
    const results: SuiteResult['cases'] = [];
    const startTime = Date.now();

    for (const file of testFiles) {
      const caseResult = await this.runTestCase(file);
      results.push(caseResult);
    }

    const endTime = Date.now();
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    return {
      total: results.length,
      passed,
      failed,
      durationMs: endTime - startTime,
      cases: results
    };
  }

  private async runTestCase(filePath: string): Promise<SuiteResult['cases'][0]> {
    const startTime = Date.now();
    
    try {
      const testCase = this.yamlLoader.load(filePath);
      
      if (testCase.skillCalls) {
        await this.runSkillCalls(testCase);
      } else if (testCase.instruction) {
        throw new Error('SkillPlanner is M3+ feature');
      } else {
        throw new Error('Test case must have either skillCalls or instruction');
      }

      const endTime = Date.now();
      return {
        id: testCase.id,
        passed: true,
        durationMs: endTime - startTime
      };
    } catch (error) {
      const endTime = Date.now();
      return {
        id: filePath,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: endTime - startTime
      };
    }
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
        await this.skillRunner.run(call, this.context);
      }
    };

    await Promise.race([executionPromise(), timeoutPromise]);
  }
}
