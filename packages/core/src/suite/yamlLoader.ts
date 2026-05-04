/**
 * yamlLoader - YAML测试用例加载器
 * 
 * 负责从YAML文件加载测试用例
 */

import { readFileSync } from 'fs';
import yaml from 'js-yaml';
import type { TestCase, TestCaseFile } from './types.js';
import type { ConfigLoader } from './ConfigLoader.js';

/**
 * YAML加载器类
 */
export class YamlLoader {
  private configLoader: ConfigLoader;

  constructor(configLoader: ConfigLoader) {
    this.configLoader = configLoader;
  }

  /**
   * 从YAML文件加载测试用例
   * @param filePath - 文件路径
   * @returns 测试用例文件对象
   */
  load(filePath: string): TestCaseFile {
    const content = readFileSync(filePath, 'utf-8');
    const parsed = yaml.load(content) as TestCaseFile;
    
    // 替换配置变量
    this.replaceConfigVariables(parsed);
    
    return parsed;
  }

  /**
   * 替换配置变量
   * @param obj - 要替换的对象
   */
  private replaceConfigVariables(obj: unknown): void {
    if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        if (typeof (obj as Record<string, unknown>)[key] === 'string') {
          const value = (obj as Record<string, unknown>)[key] as string;
          const matches = value.match(/\$\{config:([^}]+)\}/g);
          if (matches) {
            let replaced = value;
            for (const match of matches) {
              const configPath = match.slice(9, -1);
              let configValue: unknown;
              try {
                configValue = this.configLoader.get(configPath);
              } catch (error) {
                if (error instanceof Error && error.message.startsWith('Config path not found:')) {
                  throw new Error(`Config variable not found: ${configPath}`);
                }
                throw error;
              }
              if (configValue === undefined) {
                throw new Error(`Config variable not found: ${configPath}`);
              }
              replaced = replaced.replace(match, String(configValue));
            }
            (obj as Record<string, unknown>)[key] = /^\+\d+d\s+\d{1,2}:\d{2}$/.test(replaced)
              ? this.resolveRelativeLocalTime(replaced)
              : replaced;
          } else if (/^\+\d+d\s+\d{1,2}:\d{2}$/.test(value)) {
            (obj as Record<string, unknown>)[key] = this.resolveRelativeLocalTime(value);
          }
        } else if (typeof (obj as Record<string, unknown>)[key] === 'object') {
          this.replaceConfigVariables((obj as Record<string, unknown>)[key]);
        }
      }
    }
  }

  private resolveRelativeLocalTime(value: string): string {
    const match = value.match(/^\+(\d+)d\s+(\d{1,2}):(\d{2})$/);
    if (!match) return value;

    const days = Number(match[1]);
    const hours = Number(match[2]);
    const minutes = Number(match[3]);
    const date = new Date();
    date.setDate(date.getDate() + days);
    date.setHours(hours, minutes, 0, 0);

    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:00`;
  }
}

/**
 * 从YAML文件加载测试用例（函数式接口）
 * @param filePath - 文件路径
 * @returns 测试用例文件对象
 */
export function loadYamlTestCase(filePath: string): TestCaseFile {
  const content = readFileSync(filePath, 'utf-8');
  const parsed = yaml.load(content) as TestCaseFile;
  
  return parsed;
}

/**
 * 验证测试用例结构
 * @param testCase - 测试用例
 * @returns 是否有效
 */
export function validateTestCase(testCase: TestCase): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!testCase.name) {
    errors.push('Missing required field: name');
  }
  
  if (!testCase.skills || !Array.isArray(testCase.skills)) {
    errors.push('Missing or invalid skills array');
  } else {
    testCase.skills.forEach((skill: { skill?: string }, index: number) => {
      if (!skill.skill) {
        errors.push(`Skill ${index}: missing skill name`);
      }
    });
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
