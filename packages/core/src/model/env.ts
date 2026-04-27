export class ConfigError extends Error {
  constructor(variableName: string, message: string) {
    super(`ConfigError: ${variableName} - ${message}`);
    this.name = 'ConfigError';
  }
}

export interface ModelEnv {
  baseURL: string;
  apiKey: string;
  model: string;
}

export interface LoadedModelEnv {
  vlm: ModelEnv;
  llm: ModelEnv | null;
}

export interface VlmConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

export function loadModelEnv(): LoadedModelEnv {
  const vlmBaseURL = process.env.CUA_VLM_BASE_URL;
  const vlmApiKey = process.env.CUA_VLM_API_KEY;
  const vlmModel = process.env.CUA_VLM_MODEL;

  if (!vlmBaseURL) {
    throw new ConfigError('CUA_VLM_BASE_URL', 'VLM base URL is required');
  }
  if (!vlmApiKey) {
    throw new ConfigError('CUA_VLM_API_KEY', 'VLM API key is required');
  }
  if (!vlmModel) {
    throw new ConfigError('CUA_VLM_MODEL', 'VLM model name is required');
  }

  const llmBaseURL = process.env.CUA_LLM_BASE_URL || null;
  const llmApiKey = process.env.CUA_LLM_API_KEY || null;
  const llmModel = process.env.CUA_LLM_MODEL || null;

  const llm = llmBaseURL && llmApiKey && llmModel
    ? { baseURL: llmBaseURL, apiKey: llmApiKey, model: llmModel }
    : null;

  return {
    vlm: { baseURL: vlmBaseURL, apiKey: vlmApiKey, model: vlmModel },
    llm,
  };
}
