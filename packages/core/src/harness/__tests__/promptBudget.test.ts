import { describe, it, expect } from 'vitest';
import { countTokens, assertBudget, PromptBudgetExceeded } from '../promptBudget.js';

describe('countTokens', () => {
  it('returns 0 for empty input', () => {
    const t = countTokens('');
    expect(t.anthropic).toBe(0);
    expect(t.tiktoken).toBe(0);
    expect(t.max).toBe(0);
  });

  it('counts a small ASCII string', () => {
    const t = countTokens('Hello world');
    expect(t.anthropic).toBeGreaterThan(0);
    expect(t.tiktoken).toBeGreaterThan(0);
    expect(t.max).toBe(Math.max(t.anthropic, t.tiktoken));
  });

  it('counts Chinese text non-trivially', () => {
    const t = countTokens('你好世界这是一段测试文本');
    expect(t.max).toBeGreaterThan(3);
  });
});

describe('assertBudget', () => {
  it('passes when text is under budget', () => {
    expect(() => assertBudget('test', 'short text', 100)).not.toThrow();
  });

  it('throws PromptBudgetExceeded when over budget', () => {
    const longText = 'word '.repeat(500);
    expect(() => assertBudget('test', longText, 10)).toThrow(PromptBudgetExceeded);
  });

  it('error includes name + actual + max', () => {
    try {
      assertBudget('myprompt', 'word '.repeat(500), 5);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(PromptBudgetExceeded);
      const err = e as PromptBudgetExceeded;
      expect(err.message).toContain('myprompt');
      expect(err.actual).toBeGreaterThan(5);
      expect(err.max).toBe(5);
    }
  });
});
