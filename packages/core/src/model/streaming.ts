import type { ChatCompletionChunk } from 'openai/resources/chat/completions';

export interface StreamChunk {
  /** 最终答案的增量内容（用于解析 JSON tool_call） */
  delta: string;
  /**
   * 思考链的增量内容（dashscope qwen reasoning models / 类似 deepseek-r1）。
   * 只用于前端展示思考过程；不应混入 JSON 解析缓冲区。
   */
  reasoningDelta?: string;
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
  // dashscope qwen reasoning / deepseek-r1 等模型把 CoT 放在非标准字段
  // OpenAI SDK 的 ChatCompletionChunk 类型不含此字段，用 any 取
  const reasoningDelta =
    (choice?.delta as { reasoning_content?: string; reasoning?: string } | undefined)?.reasoning_content ||
    (choice?.delta as { reasoning_content?: string; reasoning?: string } | undefined)?.reasoning ||
    undefined;
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
    reasoningDelta,
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
  let reasoningDelta: string | undefined;
  if (choice?.delta) {
    const d = choice.delta as Record<string, unknown>;
    delta = (d.content as string) || '';
    reasoningDelta = (d.reasoning_content as string) || (d.reasoning as string) || undefined;
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
    reasoningDelta,
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
  let reasoningDelta: string | undefined;
  if (choice?.delta) {
    const d = choice.delta as Record<string, unknown>;
    delta = (d.content as string) || '';
    reasoningDelta = (d.reasoning_content as string) || (d.reasoning as string) || undefined;
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
    reasoningDelta,
    done,
    finishReason: (choice?.finish_reason as string) || undefined,
    usage,
  };
}
