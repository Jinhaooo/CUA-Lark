import { readFileSync } from 'fs';
import { join } from 'path';
import { load } from 'js-yaml';
import type { RiskGateConfig } from './RiskGate.js';

export interface RiskGateConfigYaml {
  riskClassification?: {
    destructiveTools?: string[];
    highRiskKeywords?: string[];
    mediumRiskKeywords?: string[];
  };
  riskGate?: {
    confirmationTimeoutMs?: number;
    autoApprovedLevels?: string[];
    skipForSkills?: string[];
  };
  riskLevels?: {
    destructive?: { requiresConfirmation?: boolean; autoApprove?: boolean };
    high?: { requiresConfirmation?: boolean; autoApprove?: boolean };
    medium?: { requiresConfirmation?: boolean; autoApprove?: boolean };
    low?: { requiresConfirmation?: boolean; autoApprove?: boolean };
  };
}

export function loadRiskGateConfigFromYaml(configPath?: string): RiskGateConfigYaml {
  const defaultPath = join(process.cwd(), 'configs', 'risk-gate.yaml');
  const filePath = configPath || defaultPath;

  try {
    const fileContent = readFileSync(filePath, 'utf-8');
    const config = load(fileContent) as RiskGateConfigYaml;
    return config || {};
  } catch (error) {
    return {};
  }
}

export function toRiskGateConfig(yamlConfig: RiskGateConfigYaml): Partial<RiskGateConfig> {
  const result: Partial<RiskGateConfig> = {};
  const destructiveTools = yamlConfig.riskClassification?.destructiveTools;
  if (destructiveTools) result.destructiveTools = destructiveTools;
  const highRiskKeywords = yamlConfig.riskClassification?.highRiskKeywords;
  if (highRiskKeywords) result.highRiskKeywords = highRiskKeywords;
  const mediumRiskKeywords = yamlConfig.riskClassification?.mediumRiskKeywords;
  if (mediumRiskKeywords) result.mediumRiskKeywords = mediumRiskKeywords;
  const autoApprovedLevels = yamlConfig.riskGate?.autoApprovedLevels;
  if (autoApprovedLevels) result.autoApprovedLevels = autoApprovedLevels;
  return result;
}
