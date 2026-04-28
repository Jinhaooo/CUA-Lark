import type { ModelClient } from '../model/types.js';
import { loadPrompt, replacePromptVariables } from './prompts/loader.js';

export interface IntentResult {
  uniquely_visible: boolean;
  confidence: number;
  reasoning: string;
}

export interface ResultJudgment {
  as_expected: boolean;
  confidence: number;
  reasoning: string;
}

export interface ActionVerifyConfig {
  intent_threshold: number;
  result_threshold: number;
  exempt_action_types: string[];
}

export interface PredictionParsed {
  action_type: string;
  action_inputs: Record<string, unknown>;
  thought: string;
}

export class ActionVerifier {
  private model: ModelClient;
  private config: ActionVerifyConfig;
  private intentPrompt: string;
  private resultPrompt: string;

  constructor(model: ModelClient, config: ActionVerifyConfig) {
    this.model = model;
    this.config = config;
    this.intentPrompt = loadPrompt('intent');
    this.resultPrompt = loadPrompt('result');
  }

  async beforeAction(parsedPrediction: PredictionParsed, beforeShot: Buffer): Promise<IntentResult> {
    const variables = {
      action_type: parsedPrediction.action_type,
      action_inputs_json: JSON.stringify(parsedPrediction.action_inputs),
      thought: parsedPrediction.thought,
    };

    const prompt = replacePromptVariables(this.intentPrompt, variables);

    try {
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

      const parsed = JSON.parse(response.content) as IntentResult;
      return {
        uniquely_visible: parsed.uniquely_visible ?? false,
        confidence: parsed.confidence ?? 0,
        reasoning: parsed.reasoning ?? '',
      };
    } catch {
      return {
        uniquely_visible: false,
        confidence: 0,
        reasoning: 'VLM 响应解析失败',
      };
    }
  }

  async afterAction(
    parsedPrediction: PredictionParsed,
    beforeShot: Buffer,
    afterShot: Buffer
  ): Promise<ResultJudgment> {
    const variables = {
      action_type: parsedPrediction.action_type,
      action_inputs_json: JSON.stringify(parsedPrediction.action_inputs),
      thought: parsedPrediction.thought,
    };

    const prompt = replacePromptVariables(this.resultPrompt, variables);

    try {
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

      const parsed = JSON.parse(response.content) as ResultJudgment;
      return {
        as_expected: parsed.as_expected ?? false,
        confidence: parsed.confidence ?? 0,
        reasoning: parsed.reasoning ?? '',
      };
    } catch {
      return {
        as_expected: false,
        confidence: 0,
        reasoning: 'VLM 响应解析失败',
      };
    }
  }

  isExempt(actionType: string): boolean {
    return this.config.exempt_action_types.includes(actionType);
  }
}

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