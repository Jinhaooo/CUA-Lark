/**
 * ConfigLoader - 配置加载器
 * 
 * 负责加载测试目标配置文件
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import yaml from 'js-yaml';

/**
 * 配置加载器类
 */
export class ConfigLoader {
  private configPath: string;
  private explicitConfigPath: boolean;

  /**
   * 构造函数
   * @param configPath - 配置文件路径（可选）
   */
  constructor(configPath?: string) {
    this.configPath = configPath ?? resolve('./configs/test-targets.yaml');
    this.explicitConfigPath = configPath !== undefined;
  }

  /**
   * 加载配置
   * @returns 配置对象
   */
  load(): Record<string, unknown> {
    try {
      const content = readFileSync(this.configPath, 'utf-8');
      const config = yaml.load(content) as Record<string, unknown>;
      this.validate(config);
      return config;
    } catch (error) {
      if (this.explicitConfigPath) {
        throw error;
      }
      return {};
    }
  }

  /**
   * 获取IM测试目标配置
   * @returns IM配置对象
   */
  getImTargets(): Record<string, unknown> {
    const config = this.load();
    return (config.im as Record<string, unknown>) ?? {};
  }

  /**
   * 获取特定测试目标
   * @param key - 目标键名
   * @returns 目标配置或undefined
   */
  getTarget(key: string): unknown {
    const config = this.load();
    return config[key];
  }

  /**
   * 通过点路径获取配置值
   * @param path - 点分隔的路径（如 'im.test_group.name_pattern'）
   * @returns 配置值或undefined
   */
  get(path: string): unknown {
    const config = this.load();
    const keys = path.split('.');
    let value: unknown = config;
    
    for (const key of keys) {
      if (typeof value === 'object' && value !== null && key in value) {
        value = (value as Record<string, unknown>)[key];
      } else {
        throw new Error(`Config path not found: ${path}`);
      }
    }
    
    return value;
  }

  private validate(config: unknown): void {
    if (!config || typeof config !== 'object') {
      throw new Error('Invalid config: root must be an object');
    }

    const im = (config as Record<string, unknown>).im;
    if (im !== undefined && (typeof im !== 'object' || im === null)) {
      throw new Error('Invalid config: im must be an object');
    }
  }
}
