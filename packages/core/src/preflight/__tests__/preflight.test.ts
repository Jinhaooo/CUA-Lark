import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PreflightError, runPreflight, checkRequiredEnv, checkMacosPermissions, checkLarkRunning } from '../index';

describe('Preflight', () => {
  const originalEnv = { ...process.env };
  const originalPlatform = process.platform;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  describe('checkRequiredEnv', () => {
    it('should pass when all required env vars are present', () => {
      process.env.CUA_VLM_BASE_URL = 'https://api.test.com';
      process.env.CUA_VLM_API_KEY = 'test-key';
      process.env.CUA_VLM_MODEL = 'test-model';

      expect(() => checkRequiredEnv()).not.toThrow();
    });

    it('should throw PreflightError with kind env when CUA_VLM_BASE_URL is missing', () => {
      process.env.CUA_VLM_API_KEY = 'test-key';
      process.env.CUA_VLM_MODEL = 'test-model';
      delete process.env.CUA_VLM_BASE_URL;

      expect(() => checkRequiredEnv()).toThrow(PreflightError);
      try {
        checkRequiredEnv();
      } catch (e) {
        expect((e as PreflightError).kind).toBe('env');
        expect((e as PreflightError).message).toContain('CUA_VLM_BASE_URL');
      }
    });

    it('should throw PreflightError when CUA_VLM_API_KEY is missing', () => {
      process.env.CUA_VLM_BASE_URL = 'https://api.test.com';
      process.env.CUA_VLM_MODEL = 'test-model';
      delete process.env.CUA_VLM_API_KEY;

      expect(() => checkRequiredEnv()).toThrow(PreflightError);
    });

    it('should throw PreflightError when CUA_VLM_MODEL is missing', () => {
      process.env.CUA_VLM_BASE_URL = 'https://api.test.com';
      process.env.CUA_VLM_API_KEY = 'test-key';
      delete process.env.CUA_VLM_MODEL;

      expect(() => checkRequiredEnv()).toThrow(PreflightError);
    });
  });

  describe('checkMacosPermissions', () => {
    it('should not throw on non-macOS platforms', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      await expect(checkMacosPermissions()).resolves.not.toThrow();
    });
  });

  describe('runPreflight', () => {
    it('should throw PreflightError when env vars are missing', async () => {
      delete process.env.CUA_VLM_BASE_URL;
      delete process.env.CUA_VLM_API_KEY;
      delete process.env.CUA_VLM_MODEL;

      await expect(runPreflight()).rejects.toThrow(PreflightError);
    });
  });
});
