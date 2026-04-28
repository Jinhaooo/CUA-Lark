import type { TestCase, SkillCall } from '../types.js';

export interface TestCaseFile extends TestCase {
  skillCalls?: SkillCall[];
  instruction?: string;
}

export interface SuiteResult {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  cases: { id: string; passed: boolean; error?: string; durationMs: number }[];
}

export interface SuiteRunner {
  run(globPattern: string): Promise<SuiteResult>;
}
