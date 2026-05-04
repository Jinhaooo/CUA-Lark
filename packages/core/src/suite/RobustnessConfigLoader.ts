/**
 * RobustnessConfigLoader - 鲁棒性配置加载器
 * 
 * 负责加载动作验证相关的配置
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import yaml from 'js-yaml';

/**
 * 鲁棒性配置接口
 */
export interface RobustnessConfig {
  action_verify: {
    intent_threshold: number;
    result_threshold: number;
    exempt_action_types: string[];
    default_for_agent_driven: boolean;
  };
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: RobustnessConfig = {
  action_verify: {
    intent_threshold: 0.7,
    result_threshold: 0.6,
    exempt_action_types: ['wait', 'finished', 'call_user', 'user_stop', 'hotkey'],
    default_for_agent_driven: true,
  },
};

export class RobustnessConfigLoader {
  private configPath: string;

  /**
   * 构造函数
   * @param configPath - 配置文件路径（可选）
   */
  constructor(configPath?: string) {
    this.configPath = configPath ?? resolve('./configs/robustness.yaml');
  }

  /**
   * 加载配置
   * 
   * 如果配置文件不存在或解析失败，返回默认配置
   * 
   * @returns 鲁棒性配置
   */
  load(): RobustnessConfig {
    try {
      const content = readFileSync(this.configPath, 'utf-8');
      const parsed = yaml.load(content) as Partial<RobustnessConfig>;
      
      return {
        action_verify: {
          intent_threshold: parsed.action_verify?.intent_threshold ?? DEFAULT_CONFIG.action_verify.intent_threshold,
          result_threshold: parsed.action_verify?.result_threshold ?? DEFAULT_CONFIG.action_verify.result_threshold,
          exempt_action_types: parsed.action_verify?.exempt_action_types ?? DEFAULT_CONFIG.action_verify.exempt_action_types,
          default_for_agent_driven: parsed.action_verify?.default_for_agent_driven ?? DEFAULT_CONFIG.action_verify.default_for_agent_driven,
        },
      };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }
}