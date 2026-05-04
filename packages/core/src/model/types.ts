export interface VisionContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
}

export interface VisionMessage {
  role: 'system' | 'user' | 'assistant';
  content: VisionContentPart[] | string;
}

export interface VisionRequest {
  messages: VisionMessage[];
  modelOverride?: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'text' | 'json_object' };
  signal?: AbortSignal;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface VisionResponse {
  content: string;
  usage: TokenUsage;
}

export interface TextMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TextRequest {
  messages: TextMessage[];
  modelOverride?: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'text' | 'json_object' };
  signal?: AbortSignal;
}

export interface TextResponse {
  content: string;
  usage: TokenUsage;
}

export interface ModelClient {
  chatVision(req: VisionRequest): Promise<VisionResponse>;
  chatText(req: TextRequest): Promise<TextResponse>;
  chatVisionStream(req: VisionRequest): AsyncIterable<import('./streaming').StreamChunk>;
  chatTextStream(req: TextRequest): AsyncIterable<import('./streaming').StreamChunk>;
}
