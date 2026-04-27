import OpenAI from 'openai';
import type {
  VisionRequest,
  VisionResponse,
  TextRequest,
  TextResponse,
  ModelClient,
} from './types';
import type { ModelEnv, VlmConfig } from './env.js';

export class ModelClientImpl implements ModelClient {
  private vlm: ModelEnv;
  private llm: ModelEnv | null;

  constructor(vlm: ModelEnv, llm: ModelEnv | null = null) {
    this.vlm = vlm;
    this.llm = llm;
  }

  async chatVision(req: VisionRequest): Promise<VisionResponse> {
    const client = new OpenAI({
      baseURL: this.vlm.baseURL,
      apiKey: this.vlm.apiKey,
    });

    const model = req.modelOverride || this.vlm.model;

    const messages = req.messages.map((msg) => {
      if (Array.isArray(msg.content)) {
        return {
          role: msg.role,
          content: msg.content.map((part) => {
            if (part.type === 'image_url') {
              return part;
            }
            return part;
          }),
        };
      }
      return { role: msg.role, content: msg.content };
    });

    const response = await client.chat.completions.create({
      model,
      messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
      temperature: req.temperature,
      max_tokens: req.max_tokens,
      response_format: req.response_format,
    });

    const choice = response.choices[0];
    const message = choice?.message;

    return {
      content: message?.content || '',
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
    };
  }

  async chatText(_req: TextRequest): Promise<TextResponse> {
    throw new ModelNotImplementedError('chatText is M3+ feature');
  }
}

export class ModelNotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelNotImplementedError';
  }
}

export function getVlmConfigForUiTarsSdk(vlm: ModelEnv): VlmConfig {
  return {
    baseURL: vlm.baseURL,
    apiKey: vlm.apiKey,
    model: vlm.model,
  };
}
