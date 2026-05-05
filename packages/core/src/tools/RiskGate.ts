import type { Tool, ToolResult, HarnessContext } from './types.js';
import { classifyRisk, type RiskLevel, type RiskClassification, loadRiskGateConfig } from './verify/risk_classifier.js';
import { RiskConfirmationRegistry, type RiskConfirmationContext } from './meta/ASK_USER.js';
import type { EventBus } from '../trace/EventBus.js';

export interface RiskGateConfig {
  destructiveTools: string[];
  highRiskKeywords: string[];
  mediumRiskKeywords: string[];
  autoApprovedLevels: string[];
}

const DEFAULT_RISK_GATE_CONFIG: RiskGateConfig = {
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
  autoApprovedLevels: [],
};

export class RiskGate {
  private config: RiskGateConfig;
  private registry: RiskConfirmationRegistry;

  constructor(config: Partial<RiskGateConfig> = {}) {
    this.config = { ...DEFAULT_RISK_GATE_CONFIG, ...config };
    this.registry = RiskConfirmationRegistry.getInstance();
    loadRiskGateConfig({
      destructiveTools: this.config.destructiveTools,
      highRiskKeywords: this.config.highRiskKeywords,
      mediumRiskKeywords: this.config.mediumRiskKeywords,
    });
  }

  async executeWithRiskGate(
    tool: Tool,
    ctx: HarnessContext,
    args: unknown,
    eventBus?: EventBus
  ): Promise<ToolResult> {
    const classification = classifyRisk(tool.name, args);

    if (classification.level === 'low' || classification.level === 'medium') {
      return tool.execute(ctx, args as any);
    }

    if (eventBus) {
      eventBus.emit({
        kind: 'risk_evaluation_complete',
        taskId: ctx.testRunId,
        toolName: tool.name,
        args,
        riskLevel: classification.level,
        reason: classification.reason,
      });
    }

    if (classification.level === 'high' || classification.level === 'destructive') {
      return this.executeWithHumanConfirmation(tool, ctx, args, classification, eventBus);
    }

    return tool.execute(ctx, args as any);
  }

  private async executeWithHumanConfirmation(
    tool: Tool,
    ctx: HarnessContext,
    args: unknown,
    classification: RiskClassification,
    eventBus?: EventBus
  ): Promise<ToolResult> {
    const taskId = ctx.testRunId;

    if (eventBus) {
      eventBus.emit({
        kind: 'risk_confirmation_required',
        taskId,
        action: { name: tool.name, args },
        riskLevel: classification.level,
        reason: classification.reason,
        question: `Approve ${classification.level} operation "${tool.name}"?`,
      });
    }

    const riskContext: RiskConfirmationContext = {
      action: { name: tool.name, args },
      riskLevel: classification.level,
      reason: classification.reason,
    };

    try {
      const result = await this.registry.register(taskId);

      if (eventBus) {
        eventBus.emit({
          kind: 'risk_confirmation_received',
          taskId,
          toolName: tool.name,
          confirmed: result.confirmed,
          source: result.source,
          reason: result.reason,
        });
      }

      if (!result.confirmed) {
        return {
          success: false,
          observation: result.source === 'timeout'
            ? 'Risk confirmation timed out (60s), operation denied'
            : 'User denied risk operation',
          error: {
            kind: result.source === 'timeout' ? 'risk_timeout_denied' : 'risk_denied',
            message: result.source === 'timeout'
              ? 'Risk confirmation timed out'
              : 'User denied risk operation',
          },
        };
      }

      if (eventBus) {
        eventBus.emit({
          kind: 'risk_approved',
          taskId,
          toolName: tool.name,
        });
      }

      return tool.execute(ctx, args as any);
    } catch (error) {
      return {
        success: false,
        observation: `Risk gate error: ${error}`,
        error: { kind: 'unknown', message: String(error) },
      };
    }
  }

  shouldSkipRiskGate(skillName: string): boolean {
    return skillName.startsWith('cleanup_');
  }
}
