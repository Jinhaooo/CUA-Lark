import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadModelEnv, ConfigError } from '../env';

describe('loadModelEnv', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should load VLM env when all required variables are present', () => {
    process.env.CUA_VLM_BASE_URL = 'https://api.test.com';
    process.env.CUA_VLM_API_KEY = 'test-key';
    process.env.CUA_VLM_MODEL = 'test-model';

    const result = loadModelEnv();

    expect(result.vlm).toEqual({
      baseURL: 'https://api.test.com',
      apiKey: 'test-key',
      model: 'test-model',
    });
    expect(result.llm).toBeNull();
  });

  it('should load LLM env when all optional variables are present', () => {
    process.env.CUA_VLM_BASE_URL = 'https://api.test.com';
    process.env.CUA_VLM_API_KEY = 'test-key';
    process.env.CUA_VLM_MODEL = 'test-model';
    process.env.CUA_LLM_BASE_URL = 'https://llm.test.com';
    process.env.CUA_LLM_API_KEY = 'llm-key';
    process.env.CUA_LLM_MODEL = 'llm-model';

    const result = loadModelEnv();

    expect(result.llm).toEqual({
      baseURL: 'https://llm.test.com',
      apiKey: 'llm-key',
      model: 'llm-model',
    });
  });

  it('should throw ConfigError when CUA_VLM_BASE_URL is missing', () => {
    process.env.CUA_VLM_API_KEY = 'test-key';
    process.env.CUA_VLM_MODEL = 'test-model';
    delete process.env.CUA_VLM_BASE_URL;

    expect(() => loadModelEnv()).toThrow(ConfigError);
    expect(() => loadModelEnv()).toThrow('CUA_VLM_BASE_URL');
  });

  it('should throw ConfigError when CUA_VLM_API_KEY is missing', () => {
    process.env.CUA_VLM_BASE_URL = 'https://api.test.com';
    process.env.CUA_VLM_MODEL = 'test-model';
    delete process.env.CUA_VLM_API_KEY;

    expect(() => loadModelEnv()).toThrow(ConfigError);
    expect(() => loadModelEnv()).toThrow('CUA_VLM_API_KEY');
  });

  it('should throw ConfigError when CUA_VLM_MODEL is missing', () => {
    process.env.CUA_VLM_BASE_URL = 'https://api.test.com';
    process.env.CUA_VLM_API_KEY = 'test-key';
    delete process.env.CUA_VLM_MODEL;

    expect(() => loadModelEnv()).toThrow(ConfigError);
    expect(() => loadModelEnv()).toThrow('CUA_VLM_MODEL');
  });

  it('should set LLM to null when only some LLM variables are present', () => {
    process.env.CUA_VLM_BASE_URL = 'https://api.test.com';
    process.env.CUA_VLM_API_KEY = 'test-key';
    process.env.CUA_VLM_MODEL = 'test-model';
    process.env.CUA_LLM_BASE_URL = 'https://llm.test.com';
    delete process.env.CUA_LLM_API_KEY;
    delete process.env.CUA_LLM_MODEL;

    const result = loadModelEnv();
    expect(result.llm).toBeNull();
  });
});
