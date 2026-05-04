import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withResilience, getCircuitBreakerState, resetCircuitBreaker } from '../HttpResilience';

describe('HttpResilience', () => {
  beforeEach(() => {
    resetCircuitBreaker('test');
  });

  afterEach(() => {
    resetCircuitBreaker('test');
    vi.clearAllMocks();
  });

  it('should succeed on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    
    const result = await withResilience(fn, {}, 'test');
    
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.data).toBe('success');
    expect(result.retries).toBe(0);
    expect(result.circuitBreakerState).toBe('closed');
  });

  it('should retry on failure', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');
    
    const result = await withResilience(fn, { retries: 2 }, 'test');
    
    expect(fn).toHaveBeenCalledTimes(3);
    expect(result.data).toBe('success');
    expect(result.retries).toBe(2);
  });

  it('should fail after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fail'));
    
    await expect(withResilience(fn, { retries: 2 }, 'test')).rejects.toThrow('always fail');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should open circuit breaker after failures', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    
    await Promise.all([
      withResilience(fn, {}, 'test').catch(() => {}),
      withResilience(fn, {}, 'test').catch(() => {}),
      withResilience(fn, {}, 'test').catch(() => {}),
      withResilience(fn, {}, 'test').catch(() => {}),
      withResilience(fn, {}, 'test').catch(() => {}),
    ]);
    
    expect(getCircuitBreakerState('test')).toBe('open');
  });

  it('should reject immediately when circuit is open', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    
    await Promise.all([
      withResilience(fn, {}, 'test-circuit').catch(() => {}),
      withResilience(fn, {}, 'test-circuit').catch(() => {}),
      withResilience(fn, {}, 'test-circuit').catch(() => {}),
      withResilience(fn, {}, 'test-circuit').catch(() => {}),
      withResilience(fn, {}, 'test-circuit').catch(() => {}),
    ]);
    
    expect(getCircuitBreakerState('test-circuit')).toBe('open');
    
    const callCountBefore = fn.mock.calls.length;
    await withResilience(fn, {}, 'test-circuit').catch(() => {});
    expect(fn.mock.calls.length).toBe(callCountBefore);
  });
});