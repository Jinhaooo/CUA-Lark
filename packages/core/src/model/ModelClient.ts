import OpenAI from 'openai';
import type {
  VisionRequest,
  VisionResponse,
  TextRequest,
  TextResponse,
  ModelClient,
} from './types.js';
import type { ModelEnv, VlmConfig } from './env.js';
import { parseOpenAIChatCompletionChunk, StreamInterrupted } from './streaming.js';

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
          content: msg.content.map((part) => part),
        };
      }
      return { role: msg.role, content: msg.content };
    });

    const response = await client.chat.completions.create(
      {
        model,
        messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
        temperature: req.temperature,
        max_tokens: req.max_tokens,
        response_format: req.response_format,
      },
      { signal: req.signal },
    );

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

  async chatText(req: TextRequest): Promise<TextResponse> {
    const env = this.llm ?? this.vlm;
    const client = new OpenAI({
      baseURL: env.baseURL,
      apiKey: env.apiKey,
    });

    const response = await client.chat.completions.create(
      {
        model: req.modelOverride || env.model,
        messages: req.messages as OpenAI.Chat.ChatCompletionMessageParam[],
        temperature: req.temperature ?? 0,
        max_tokens: req.max_tokens,
        response_format: req.response_format,
      },
      { signal: req.signal },
    );

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

  async *chatVisionStream(req: VisionRequest): AsyncIterable<import('./streaming').StreamChunk> {
    const client = new OpenAI({
      baseURL: this.vlm.baseURL,
      apiKey: this.vlm.apiKey,
    });

    const model = req.modelOverride || this.vlm.model;

    const messages = req.messages.map((msg) => {
      if (Array.isArray(msg.content)) {
        return {
          role: msg.role,
          content: msg.content.map((part) => part),
        };
      }
      return { role: msg.role, content: msg.content };
    });

    const stream = await client.chat.completions.create(
      {
        model,
        messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
        temperature: req.temperature,
        max_tokens: req.max_tokens,
        response_format: req.response_format,
        stream: true,
      },
      { signal: req.signal },
    );

    let chunksReceived = 0;
    let partialContent = '';

    for await (const chunk of stream) {
      chunksReceived++;
      const parsed = parseOpenAIChatCompletionChunk(chunk);
      partialContent += parsed.delta;
      yield parsed;

      if (parsed.done) {
        return;
      }
    }

    if (chunksReceived === 0) {
      throw new StreamInterrupted(chunksReceived, partialContent);
    }
  }

  async *chatTextStream(req: TextRequest): AsyncIterable<import('./streaming').StreamChunk> {
    const env = this.llm ?? this.vlm;
    const client = new OpenAI({
      baseURL: env.baseURL,
      apiKey: env.apiKey,
    });

    const stream = await client.chat.completions.create(
      {
        model: req.modelOverride || env.model,
        messages: req.messages as OpenAI.Chat.ChatCompletionMessageParam[],
        temperature: req.temperature ?? 0,
        max_tokens: req.max_tokens,
        response_format: req.response_format,
        stream: true,
      },
      { signal: req.signal },
    );

    let chunksReceived = 0;
    let partialContent = '';

    for await (const chunk of stream) {
      chunksReceived++;
      const parsed = parseOpenAIChatCompletionChunk(chunk);
      partialContent += parsed.delta;
      yield parsed;

      if (parsed.done) {
        return;
      }
    }

    if (chunksReceived === 0) {
      throw new StreamInterrupted(chunksReceived, partialContent);
    }
  }
}

export function getVlmConfigForUiTarsSdk(vlm: ModelEnv): VlmConfig {
  return {
    baseURL: vlm.baseURL,
    apiKey: vlm.apiKey,
    model: vlm.model,
  };
}
