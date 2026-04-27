import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelClientImpl } from '../ModelClient';
import type { VisionRequest } from '../types';

const mockCreate = vi.hoisted(() => vi.fn());

vi.mock('openai', () => {
  mockCreate.mockResolvedValue({
    choices: [{
      message: {
        content: 'test response',
      },
    }],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
    },
  });

  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  };
});

describe('ModelClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('chatVision', () => {
    it('should call OpenAI with correct parameters', async () => {
      const client = new ModelClientImpl({
        baseURL: 'https://api.test.com',
        apiKey: 'test-key',
        model: 'test-model',
      });

      const request: VisionRequest = {
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What do you see?' },
            ],
          },
        ],
      };

      await client.chatVision(request);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'test-model',
          messages: expect.any(Array),
        }),
      );
    });

    it('should support modelOverride', async () => {
      const client = new ModelClientImpl({
        baseURL: 'https://api.test.com',
        apiKey: 'test-key',
        model: 'default-model',
      });

      const request: VisionRequest = {
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'test' }],
          },
        ],
        modelOverride: 'override-model',
      };

      await client.chatVision(request);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'override-model',
        }),
      );
    });

    it('should return VisionResponse with content and usage', async () => {
      const client = new ModelClientImpl({
        baseURL: 'https://api.test.com',
        apiKey: 'test-key',
        model: 'test-model',
      });

      const request: VisionRequest = {
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'test' }],
          },
        ],
      };

      const response = await client.chatVision(request);

      expect(response).toEqual({
        content: 'test response',
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
      });
    });
  });

  describe('chatText', () => {
    it('should throw NotImplementedError', async () => {
      const client = new ModelClientImpl({
        baseURL: 'https://api.test.com',
        apiKey: 'test-key',
        model: 'test-model',
      });

      await expect(
        client.chatText({
          messages: [{ role: 'user', content: 'test' }],
        }),
      ).rejects.toThrow('chatText is M3+ feature');
    });
  });
});
