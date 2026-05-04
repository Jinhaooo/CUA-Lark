/**
 * ActionVerifier - 动作验证器
 * 
 * 提供动作级别的视觉验证能力，包括：
 * 1. 前置意图验证：验证目标元素是否唯一可见
 * 2. 后置结果验证：验证动作执行后UI是否发生预期变化
 * 
 * 核心作用是提高自动化测试的鲁棒性，防止静默失败
 */

import type { ModelClient } from '../model/types.js';
import { loadPrompt, replacePromptVariables } from './prompts/loader.js';

/**
 * 前置意图验证结果
 */
export interface IntentResult {
  uniquely_visible: boolean;  // 目标元素是否唯一可见
  confidence: number;         // 判断置信度 (0-1)
  reasoning: string;          // 判断理由
}

/**
 * 后置结果判断结果
 */
export interface ResultJudgment {
  as_expected: boolean;       // UI变化是否符合预期
  confidence: number;         // 判断置信度 (0-1)
  reasoning: string;          // 判断理由
}

/**
 * 动作验证配置
 */
export interface ActionVerifyConfig {
  intent_threshold: number;      // 意图验证阈值
  result_threshold: number;      // 结果验证阈值
  exempt_action_types: string[]; // 豁免的动作类型（无需验证）
}

/**
 * 解析后的动作预测
 */
export interface PredictionParsed {
  action_type: string;                    // 动作类型
  action_inputs: Record<string, unknown>; // 动作参数
  thought: string;                        // VLM思考链
}

export class ActionVerifier {
  private model: ModelClient;
  private config: ActionVerifyConfig;
  private intentPrompt: string;   // 前置意图验证prompt模板
  private resultPrompt: string;   // 后置结果验证prompt模板

  /**
   * 构造函数
   * @param model - 模型客户端
   * @param config - 验证配置
   */
  constructor(model: ModelClient, config: ActionVerifyConfig) {
    this.model = model;
    this.config = config;
    this.intentPrompt = loadPrompt('intent');
    this.resultPrompt = loadPrompt('result');
  }

  /**
   * 前置意图验证
   * 在执行动作前验证目标元素是否唯一可见
   * 
   * @param parsedPrediction - 解析后的动作预测
   * @param beforeShot - 动作前截图
   * @returns 验证结果
   */
  async beforeAction(parsedPrediction: PredictionParsed, beforeShot: Buffer): Promise<IntentResult> {
    // 构建prompt变量
    const variables = {
      action_type: parsedPrediction.action_type,
      action_inputs_json: JSON.stringify(parsedPrediction.action_inputs),
      thought: parsedPrediction.thought,
    };

    // 替换prompt模板中的变量
    const prompt = replacePromptVariables(this.intentPrompt, variables);

    try {
      // 调用VLM进行视觉验证
      const response = await this.model.chatVision({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: 'data:image/png;base64,' + beforeShot.toString('base64'),
                  detail: 'high',
                },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
      });

      // 解析VLM响应
      const parsed = JSON.parse(response.content) as IntentResult;
      return {
        uniquely_visible: parsed.uniquely_visible ?? false,
        confidence: parsed.confidence ?? 0,
        reasoning: parsed.reasoning ?? '',
      };
    } catch {
      // 如果VLM调用失败，返回默认结果（不阻止执行）
      return {
        uniquely_visible: false,
        confidence: 0,
        reasoning: 'VLM 响应解析失败',
      };
    }
  }

  /**
   * 后置结果验证
   * 在执行动作后验证UI是否发生预期变化
   * 
   * @param parsedPrediction - 解析后的动作预测
   * @param beforeShot - 动作前截图
   * @param afterShot - 动作后截图
   * @returns 验证结果
   */
  async afterAction(
    parsedPrediction: PredictionParsed,
    beforeShot: Buffer,
    afterShot: Buffer
  ): Promise<ResultJudgment> {
    // 构建prompt变量
    const variables = {
      action_type: parsedPrediction.action_type,
      action_inputs_json: JSON.stringify(parsedPrediction.action_inputs),
      thought: parsedPrediction.thought,
    };

    // 替换prompt模板中的变量
    const prompt = replacePromptVariables(this.resultPrompt, variables);

    try {
      // 调用VLM进行视觉对比验证
      const response = await this.model.chatVision({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: 'data:image/png;base64,' + beforeShot.toString('base64'),
                  detail: 'high',
                },
              },
              {
                type: 'image_url',
                image_url: {
                  url: 'data:image/png;base64,' + afterShot.toString('base64'),
                  detail: 'high',
                },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
      });

      // 解析VLM响应
      const parsed = JSON.parse(response.content) as ResultJudgment;
      return {
        as_expected: parsed.as_expected ?? false,
        confidence: parsed.confidence ?? 0,
        reasoning: parsed.reasoning ?? '',
      };
    } catch {
      // 如果VLM调用失败，返回默认结果（不阻止执行）
      return {
        as_expected: false,
        confidence: 0,
        reasoning: 'VLM 响应解析失败',
      };
    }
  }

  /**
   * 检查动作类型是否豁免验证
   * @param actionType - 动作类型
   * @returns 是否豁免
   */
  isExempt(actionType: string): boolean {
    return this.config.exempt_action_types.includes(actionType);
  }
}

/**
 * 动作意图置信度不足错误
 * 当前置意图验证失败时抛出
 */
export class ActionIntentLowConfidence extends Error {
  confidence: number;
  reasoning: string;

  constructor(confidence: number, reasoning: string) {
    super(`Action intent low confidence: ${confidence}, reason: ${reasoning}`);
    this.name = 'ActionIntentLowConfidence';
    this.confidence = confidence;
    this.reasoning = reasoning;
  }
}

/**
 * 静默动作失败错误
 * 当后置结果验证失败时抛出
 */
export class SilentActionFailure extends Error {
  confidence: number;
  reasoning: string;

  constructor(confidence: number, reasoning: string) {
    super(`Silent action failure: ${confidence}, reason: ${reasoning}`);
    this.name = 'SilentActionFailure';
    this.confidence = confidence;
    this.reasoning = reasoning;
  }
}