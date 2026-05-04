/**
 * 环境变量管理模块
 * 
 * 负责从环境变量中读取配置，并提供验证功能
 */

import dotenv from 'dotenv';

// 加载.env文件
dotenv.config();

/**
 * 获取VLM基础URL
 * @returns VLM API基础地址
 */
export function getVlmBaseUrl(): string {
  return process.env.CUA_VLM_BASE_URL || '';
}

/**
 * 获取VLM API密钥
 * @returns API密钥
 */
export function getVlmApiKey(): string {
  return process.env.CUA_VLM_API_KEY || '';
}

/**
 * 获取VLM模型名称
 * @returns 模型名称
 */
export function getVlmModel(): string {
  return process.env.CUA_VLM_MODEL || '';
}

/**
 * 获取OCR服务端口
 * @returns 端口号，默认7010
 */
export function getOcrPort(): number {
  const port = process.env.CUA_OCR_PORT;
  return port ? parseInt(port, 10) : 7010;
}

/**
 * 验证VLM环境变量是否齐全
 * @returns 验证结果和缺失的变量列表
 */
export function validateVlmEnv(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  if (!getVlmBaseUrl()) {
    missing.push('CUA_VLM_BASE_URL');
  }
  if (!getVlmApiKey()) {
    missing.push('CUA_VLM_API_KEY');
  }
  if (!getVlmModel()) {
    missing.push('CUA_VLM_MODEL');
  }
  
  return {
    valid: missing.length === 0,
    missing
  };
}

/**
 * 检查是否设置了安全边界
 * @returns 安全边界字符串或undefined
 */
export function getSafeBounds(): string | undefined {
  return process.env.CUA_LARK_SAFE_BOUNDS;
}

/**
 * 配置错误类
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * 加载模型环境配置
 * @returns 包含vlm和llm配置的对象
 * @throws ConfigError 如果缺少必需的VLM环境变量
 */
export function loadModelEnv(): { vlm: ModelEnv; llm: ModelEnv | null } {
  const vlmBaseUrl = getVlmBaseUrl();
  const vlmApiKey = getVlmApiKey();
  const vlmModel = getVlmModel();
  
  if (!vlmBaseUrl) {
    throw new ConfigError('Missing required environment variable: CUA_VLM_BASE_URL');
  }
  if (!vlmApiKey) {
    throw new ConfigError('Missing required environment variable: CUA_VLM_API_KEY');
  }
  if (!vlmModel) {
    throw new ConfigError('Missing required environment variable: CUA_VLM_MODEL');
  }

  const vlm: ModelEnv = {
    baseURL: vlmBaseUrl,
    apiKey: vlmApiKey,
    model: vlmModel,
  };

  const llmBaseUrl = process.env.CUA_LLM_BASE_URL;
  const llmApiKey = process.env.CUA_LLM_API_KEY;
  const llmModel = process.env.CUA_LLM_MODEL;

  const llm: ModelEnv | null = llmBaseUrl && llmApiKey && llmModel
    ? {
        baseURL: llmBaseUrl,
        apiKey: llmApiKey,
        model: llmModel,
      }
    : null;

  return { vlm, llm };
}

/**
 * 模型环境配置接口
 */
export interface ModelEnv {
  baseURL: string;
  apiKey: string;
  model: string;
}

export interface VlmConfig extends ModelEnv {}
