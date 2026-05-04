/**
 * Suite类型定义
 * 
 * 定义测试套件和测试用例的类型
 */

import type { SkillCall } from '../types.js';

/**
 * 测试套件执行结果
 */
export interface SuiteResult {
  total: number;
  passed: number;
  failed: number;
  skipped?: number;
  durationMs: number;
  cases: Array<{
    id: string;
    passed: boolean;
    skipped?: boolean;
    error?: string;
    durationMs: number;
  }>;
}

/**
 * 测试用例接口定义
 */
export interface TestCase {
  id?: string;
  name?: string;
  title?: string;
  description?: string;
  tags?: string[];
  timeoutSeconds?: number;
  expectations?: string[];
  instruction?: string;
  skillCalls?: SkillCall[];
  skills?: SkillCall[];
  setup_skills?: SkillCall[];
  teardown_skills?: SkillCall[];
  config?: Record<string, unknown>;
}

/**
 * 测试用例文件
 */
export interface TestCaseFile extends TestCase {
  file?: string;          // 文件路径
}
