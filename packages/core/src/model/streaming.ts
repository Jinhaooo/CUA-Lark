import type { ChatCompletionChunk } from 'openai/resources/chat/completions';

export interface StreamChunk {
  delta: string;
  done: boolean;
  finishReason?: string;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
}

export class StreamInterrupted extends Error {
  constructor(public chunksReceived: number, public partialContent: string) {
    super(`Stream interrupted after ${chunksReceived} chunks`);
  }
}

export function parseOpenAIChatCompletionChunk(chunk: ChatCompletionChunk): StreamChunk {
  const choice = chunk.choices[0];
  const delta = choice?.delta.content || '';
  const done = choice?.finish_reason != null;
  
  let usage: StreamChunk['usage'];
  if (chunk.usage) {
    usage = {
      inputTokens: chunk.usage.prompt_tokens || 0,
      outputTokens: chunk.usage.completion_tokens || 0,
      totalTokens: chunk.usage.total_tokens || 0,
    };
  }

  return {
    delta,
    done,
    finishReason: choice?.finish_reason || undefined,
    usage,
  };
}

export function parseDoubaoChunk(chunk: unknown): StreamChunk {
  const data = chunk as Record<string, unknown>;
  const choices = data.choices as Array<Record<string, unknown>> || [];
  const choice = choices[0];
  
  let delta = '';
  if (choice?.delta) {
    delta = (choice.delta as Record<string, unknown>).content as string || '';
  }
  
  const done = choice?.finish_reason != null;
  
  let usage: StreamChunk['usage'];
  const usageData = data.usage as Record<string, number>;
  if (usageData) {
    usage = {
      inputTokens: usageData.prompt_tokens || 0,
      outputTokens: usageData.completion_tokens || 0,
      totalTokens: usageData.total_tokens || 0,
    };
  }

  return {
    delta,
    done,
    finishReason: (choice?.finish_reason as string) || undefined,
    usage,
  };
}

export function parseMoonshotChunk(chunk: unknown): StreamChunk {
  const data = chunk as Record<string, unknown>;
  const choices = data.choices as Array<Record<string, unknown>> || [];
  const choice = choices[0];
  
  let delta = '';
  if (choice?.delta) {
    delta = (choice.delta as Record<string, unknown>).content as string || '';
  }
  
  const done = choice?.finish_reason != null;
  
  let usage: StreamChunk['usage'];
  const usageData = data.usage as Record<string, number>;
  if (usageData) {
    usage = {
      inputTokens: usageData.prompt_tokens || 0,
      outputTokens: usageData.completion_tokens || 0,
      totalTokens: usageData.total_tokens || 0,
    };
  }

  return {
    delta,
    done,
    finishReason: (choice?.finish_reason as string) || undefined,
    usage,
  };
}
