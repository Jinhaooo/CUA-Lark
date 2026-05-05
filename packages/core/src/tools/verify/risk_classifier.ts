import { z } from 'zod';
import type { Tool, HarnessContext, ToolResult } from '../types.js';

export type RiskLevel = 'low' | 'medium' | 'high' | 'destructive';

export interface RiskClassification {
  level: RiskLevel;
  reason: string;
}

interface RiskGateConfig {
  destructiveTools: string[];
  highRiskKeywords: string[];
  mediumRiskKeywords: string[];
}

const defaultConfig: RiskGateConfig = {
  destructiveTools: [
    'delete_chat',
    'delete_message',
    'delete_event',
    'delete_doc',
    'dismiss_group',
    'leave_group',
    'clear_recall',
    'permanent_delete',
    'batch_delete',
  ],
  highRiskKeywords: [
    'delete',
    'remove',
    'dismiss',
    'clear',
    'recall',
    'revoke',
    'archive',
    'trash',
    'destroy',
    '注销',
    '解散',
    '清空',
    '永久',
  ],
  mediumRiskKeywords: [
    'edit',
    'modify',
    'update',
    'move',
    'copy',
    'share',
    'invite',
    'transfer',
  ],
};

let cachedConfig: RiskGateConfig | null = null;

export function loadRiskGateConfig(config: Partial<RiskGateConfig> = {}): RiskGateConfig {
  if (cachedConfig) {
    return { ...defaultConfig, ...cachedConfig, ...config };
  }
  cachedConfig = { ...defaultConfig, ...config };
  return cachedConfig;
}

export function classifyRisk(toolName: string, toolArgs: unknown, config?: Partial<RiskGateConfig>): RiskClassification {
  const cfg = loadRiskGateConfig(config);

  const normalizedToolName = toolName.toLowerCase().replace(/_/g, '');
  for (const destructive of cfg.destructiveTools) {
    const normalizedDestructive = destructive.toLowerCase().replace(/_/g, '');
    if (normalizedToolName.includes(normalizedDestructive)) {
      return {
        level: 'destructive',
        reason: `Tool "${toolName}" is on the destructive whitelist`,
      };
    }
  }

  const argsString = JSON.stringify(toolArgs).toLowerCase();
  for (const keyword of cfg.highRiskKeywords) {
    if (argsString.includes(keyword.toLowerCase())) {
      return {
        level: 'high',
        reason: `Args contain high-risk keyword: "${keyword}"`,
      };
    }
  }

  for (const keyword of cfg.mediumRiskKeywords) {
    if (argsString.includes(keyword.toLowerCase())) {
      return {
        level: 'medium',
        reason: `Args contain medium-risk keyword: "${keyword}"`,
      };
    }
  }

  return {
    level: 'low',
    reason: `No risk indicators found for tool "${toolName}"`,
  };
}

export const riskClassifierTool: Tool<{ toolName: string; toolArgs?: unknown }, RiskClassification> = {
  name: 'risk_classifier',
  description: 'Classify the risk level of a tool call. Returns low/medium/high/destructive based on tool name and arguments.',
  argsSchema: z.object({
    toolName: z.string(),
    toolArgs: z.any(),
  }),
  async execute(_ctx: HarnessContext, args: { toolName: string; toolArgs?: unknown }): Promise<ToolResult<RiskClassification>> {
    try {
      const classification = classifyRisk(args.toolName, args.toolArgs);
      return {
        success: true,
        data: classification,
        observation: `Risk level: ${classification.level} - ${classification.reason}`,
      };
    } catch (error) {
      return {
        success: false,
        observation: `Risk classification failed: ${error}`,
        error: { kind: 'unknown', message: String(error) },
      };
    }
  },
  category: 'verify',
  costHint: 'cheap',
};
