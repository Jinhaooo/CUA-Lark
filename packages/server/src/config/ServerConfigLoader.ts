import { readFileSync } from 'fs';
import { parse } from 'yaml';

export interface ServerConfig {
  host: string;
  port: number;
  sseHeartbeatMs: number;
  httpClient: {
    timeoutMs: number;
    retries: number;
    circuitBreaker: {
      failureThreshold: number;
      resetMs: number;
    };
  };
  streaming: {
    chunkIdleTimeoutMs: number;
  };
  taskQueue: {
    maxSize: number;
  };
  trace: {
    dbPath: string;
  };
  cors: {
    allowedOrigins: string[];
  };
}

const defaultConfig: ServerConfig = {
  host: '127.0.0.1',
  port: 7878,
  sseHeartbeatMs: 15000,
  httpClient: {
    timeoutMs: 30000,
    retries: 2,
    circuitBreaker: {
      failureThreshold: 5,
      resetMs: 30000,
    },
  },
  streaming: {
    chunkIdleTimeoutMs: 15000,
  },
  taskQueue: {
    maxSize: 100,
  },
  trace: {
    dbPath: './traces/cua-lark.db',
  },
  cors: {
    allowedOrigins: ['http://localhost:5173'],
  },
};

export function loadServerConfig(path: string = './configs/server.yaml'): ServerConfig {
  try {
    const content = readFileSync(path, 'utf-8');
    const loaded = parse(content) as Partial<ServerConfig>;
    return deepMerge(defaultConfig, loaded);
  } catch {
    return defaultConfig;
  }
}

function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = { ...(target as Record<string, unknown>) };
  const sourceRecord = source as Record<string, unknown>;
  const targetRecord = target as Record<string, unknown>;

  for (const key of Object.keys(sourceRecord)) {
    const targetValue = targetRecord[key];
    const sourceValue = sourceRecord[key];
    if (
      targetValue !== null &&
      sourceValue !== null &&
      !Array.isArray(targetValue) &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      typeof sourceValue === 'object'
    ) {
      result[key] = deepMerge(targetValue, sourceValue as Partial<typeof targetValue>);
    } else {
      result[key] = sourceValue;
    }
  }
  return result as T;
}
