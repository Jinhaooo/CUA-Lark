import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SelfHealingExecutor } from '../SelfHealingExecutor.js';
import type { HarnessTrace } from '../types.js';

describe('SelfHealingExecutor', () => {
  let executor: SelfHealingExecutor;

  beforeEach(() => {
    executor = new SelfHealingExecutor({
      maxRetries: 2,
      minConfidence: 0.5,
    });
  });

  it('should create executor with default config', () => {
    const defaultExecutor = new SelfHealingExecutor();
    expect(defaultExecutor).toBeDefined();
  });

  it('should retry for retriable reasons', () => {
    const result = executor.shouldRetry('locator_failed', 0);
    expect(result).toBe(true);
  });

  it('should not retry for unretryable reasons', () => {
    const unretryableReasons = [
      'permission_denied',
      'risk_denied',
      'max_iterations_reached',
      'budget_exceeded',
      'tool_call_parse_failed',
    ];

    for (const reason of unretryableReasons) {
      const result = executor.shouldRetry(reason, 0);
      expect(result).toBe(false);
    }
  });

  it('should not retry after max retries', () => {
    const result = executor.shouldRetry('locator_failed', 2);
    expect(result).toBe(false);
  });

  it('should get skip cause for unretryable kind', () => {
    const result = executor.getSkipCause('permission_denied', 0.8, 0);
    expect(result).toBe('unretryable_kind');
  });

  it('should get skip cause for low confidence', () => {
    const result = executor.getSkipCause('locator_failed', 0.3, 0);
    expect(result).toBe('low_confidence');
  });

  it('should get skip cause for max retries', () => {
    const result = executor.getSkipCause('locator_failed', 0.8, 2);
    expect(result).toBe('max_retries');
  });

  it('should return null when no skip cause', () => {
    const result = executor.getSkipCause('locator_failed', 0.8, 0);
    expect(result).toBe(null);
  });

  it('should build retry prompt with analysis', () => {
    const originalPrompt = 'You are a helpful assistant.';
    const analysis = {
      confidence: 0.85,
      rootCause: 'Locator failed due to dynamic element',
      alternativeStrategy: 'Try using OCR to locate the element',
    };

    const result = executor.buildRetryPrompt(originalPrompt, analysis);

    expect(result).toContain('rootCause');
    expect(result).toContain('alternativeStrategy');
    expect(result).toContain(analysis.rootCause);
    expect(result).toContain(analysis.alternativeStrategy);
  });

  it('should calculate cosine similarity correctly', () => {
    const a = [1, 0, 0];
    const b = [1, 0, 0];
    const result = executor.cosineSimilarity(a, b);
    expect(result).toBe(1);
  });

  it('should handle zero vectors in cosine similarity', () => {
    const a = [0, 0, 0];
    const b = [1, 1, 1];
    const result = executor.cosineSimilarity(a, b);
    expect(result).toBe(0);
  });
});

describe('SelfHealing Integration', () => {
  it('should analyze trace for failures', async () => {
    const executor = new SelfHealingExecutor();
    const mockTrace: HarnessTrace[] = [
      {
        iteration: 1,
        thought: 'Trying to click button',
        toolCall: { name: 'click', args: { x: 100, y: 200 } },
        observation: 'Element not found',
        durationMs: 100,
        cost: { tokens: 10 },
      },
    ];

    const mockAnalyst = vi.fn().mockResolvedValue({
      confidence: 0.9,
      rootCause: 'Element not in DOM',
      alternativeStrategy: 'Wait for element to appear',
    });

    const result = await executor.analyze(mockTrace, 'locator_failed', '', mockAnalyst);

    expect(result.confidence).toBe(0.9);
    expect(result.rootCause).toBe('Element not in DOM');
    expect(mockAnalyst).toHaveBeenCalled();
  });

  it('should handle analysis errors gracefully', async () => {
    const executor = new SelfHealingExecutor();
    const mockTrace: HarnessTrace[] = [];

    const mockAnalyst = vi.fn().mockRejectedValue(new Error('Analysis failed'));

    const result = await executor.analyze(mockTrace, 'locator_failed', '', mockAnalyst);

    expect(result.confidence).toBe(0);
    expect(result.rootCause).toContain('Self-healing analysis failed');
  });
});
