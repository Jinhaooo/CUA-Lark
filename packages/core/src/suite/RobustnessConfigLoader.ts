import { readFileSync } from 'fs';
import { resolve } from 'path';
import yaml from 'js-yaml';

export interface RobustnessConfig {
  action_verify: {
    intent_threshold: number;
    result_threshold: number;
    exempt_action_types: string[];
    default_for_agent_driven: boolean;
  };
}

const DEFAULT_CONFIG: RobustnessConfig = {
  action_verify: {
    intent_threshold: 0.7,
    result_threshold: 0.6,
    exempt_action_types: ['wait', 'finished', 'call_user', 'user_stop', 'hotkey'],
    default_for_agent_driven: false,
  },
};

export class RobustnessConfigLoader {
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath ?? resolve('./configs/robustness.yaml');
  }

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