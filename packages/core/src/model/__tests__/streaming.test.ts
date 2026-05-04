import { describe, it, expect } from 'vitest';
import { parseOpenAIChatCompletionChunk, parseDoubaoChunk, parseMoonshotChunk, StreamChunk } from '../streaming';

describe('streaming', () => {
  describe('parseOpenAIChatCompletionChunk', () => {
    it('should parse standard OpenAI chunk', () => {
      const chunk = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: 1694268190,
        model: 'gpt-4o',
        choices: [{
          index: 0,
          delta: { content: 'Hello' },
          finish_reason: null,
        }],
      };

      const result = parseOpenAIChatCompletionChunk(chunk as any);
      expect(result.delta).toBe('Hello');
      expect(result.done).toBe(false);
      expect(result.finishReason).toBeUndefined();
    });

    it('should parse final chunk with usage', () => {
      const chunk = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: 1694268190,
        model: 'gpt-4o',
        choices: [{
          index: 0,
          delta: { content: '!' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };

      const result = parseOpenAIChatCompletionChunk(chunk as any);
      expect(result.delta).toBe('!');
      expect(result.done).toBe(true);
      expect(result.finishReason).toBe('stop');
      expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
    });
  });

  describe('parseDoubaoChunk', () => {
    it('should parse Doubao chunk', () => {
      const chunk = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: 1694268190,
        model: 'doubao-pro',
        choices: [{
          index: 0,
          delta: { content: 'Hi' },
          finish_reason: null,
        }],
      };

      const result = parseDoubaoChunk(chunk);
      expect(result.delta).toBe('Hi');
      expect(result.done).toBe(false);
    });
  });

  describe('parseMoonshotChunk', () => {
    it('should parse Moonshot chunk', () => {
      const chunk = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: 1694268190,
        model: 'moonshot-v1-8k',
        choices: [{
          index: 0,
          delta: { content: 'Hello' },
          finish_reason: null,
        }],
      };

      const result = parseMoonshotChunk(chunk);
      expect(result.delta).toBe('Hello');
      expect(result.done).toBe(false);
    });
  });
});