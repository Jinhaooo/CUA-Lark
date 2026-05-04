import axios from 'axios';
import axiosRetry from 'axios-retry';
import CircuitBreaker from 'opossum';

export interface ResilienceConfig {
  timeoutMs?: number;
  retries?: number;
  circuitBreaker?: {
    failureThreshold?: number;
    resetMs?: number;
  };
}

export interface ResilienceResult<T> {
  data: T;
  retries: number;
  circuitBreakerState: 'closed' | 'open' | 'halfOpen';
}

const defaultConfig: Required<ResilienceConfig> = {
  timeoutMs: 30000,
  retries: 2,
  circuitBreaker: {
    failureThreshold: 5,
    resetMs: 30000,
  },
};

const circuitBreakers = new Map<string, CircuitBreaker>();

function getCircuitBreaker(name: string, config: Required<ResilienceConfig>): CircuitBreaker {
  let cb = circuitBreakers.get(name);
  if (!cb) {
    cb = new CircuitBreaker(
      () => Promise.resolve(),
      {
        failureThreshold: config.circuitBreaker.failureThreshold,
        resetTimeout: config.circuitBreaker.resetMs,
      }
    );
    circuitBreakers.set(name, cb);
  }
  return cb;
}

export async function withResilience<T>(
  fn: () => Promise<T>,
  opts: ResilienceConfig = {},
  breakerName: string = 'default'
): Promise<ResilienceResult<T>> {
  const config = { ...defaultConfig, ...opts };
  
  const circuitBreaker = getCircuitBreaker(breakerName, config);
  const retriesRef = { value: 0 };

  const wrappedFn = async (): Promise<T> => {
    retriesRef.value = 0;
    
    const axiosInstance = axios.create({
      timeout: config.timeoutMs,
    });

    axiosRetry(axiosInstance, {
      retries: config.retries,
      retryDelay: (retryCount) => {
        retriesRef.value = retryCount;
        return Math.pow(2, retryCount) * 1000;
      },
      retryCondition: (error) => {
        return axiosRetry.isNetworkError(error) || 
               axiosRetry.isRetryableError(error) ||
               (error.response?.status !== undefined && error.response.status >= 500);
      },
    });

    return fn();
  };

  const result = await circuitBreaker.fire(wrappedFn);
  
  return {
    data: result as T,
    retries: retriesRef.value,
    circuitBreakerState: circuitBreaker.state as 'closed' | 'open' | 'halfOpen',
  };
}

export async function withResilienceStream<T>(
  fn: () => AsyncIterable<T>,
  opts: ResilienceConfig = {},
  breakerName: string = 'default-stream'
): Promise<AsyncIterable<T>> {
  const config = { ...defaultConfig, ...opts };
  const circuitBreaker = getCircuitBreaker(breakerName, config);

  async function* wrapped(): AsyncIterable<T> {
    const stream = await circuitBreaker.fire(fn);
    for await (const chunk of stream as AsyncIterable<T>) {
      yield chunk;
    }
  }

  return wrapped();
}

export function getCircuitBreakerState(name: string = 'default'): 'closed' | 'open' | 'halfOpen' | 'unknown' {
  const cb = circuitBreakers.get(name);
  return cb ? (cb.state as 'closed' | 'open' | 'halfOpen') : 'unknown';
}

export function resetCircuitBreaker(name: string = 'default'): void {
  const cb = circuitBreakers.get(name);
  if (cb) {
    cb.reset();
  }
}
