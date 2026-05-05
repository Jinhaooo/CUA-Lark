export interface EmbeddingOptions {
  model?: string;
  dimensions?: number;
  encodingFormat?: 'float' | 'base64';
}

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}

export interface SearchResult<T> {
  item: T;
  score: number;
}

export interface EmbeddingClientConfig {
  baseUrl: string;
  apiKey?: string;
  defaultModel?: string;
  defaultDimensions?: number;
  timeout?: number;
}

export class EmbeddingClient {
  private config: Required<EmbeddingClientConfig>;
  private cache: Map<string, EmbeddingResult>;

  constructor(config: EmbeddingClientConfig) {
    this.config = {
      baseUrl: config.baseUrl.replace(/\/$/, ''),
      apiKey: config.apiKey || process.env.EMBEDDING_API_KEY || '',
      defaultModel: config.defaultModel || 'text-embedding-3-small',
      defaultDimensions: config.defaultDimensions || 1536,
      timeout: config.timeout || 30000,
    };
    this.cache = new Map();
  }

  private getCacheKey(text: string, model: string): string {
    return `${model}:${text}`;
  }

  async embed(text: string, options?: EmbeddingOptions): Promise<EmbeddingResult> {
    const model = options?.model || this.config.defaultModel;
    const cacheKey = this.getCacheKey(text, model);

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const response = await fetch(`${this.config.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
      },
      body: JSON.stringify({
        input: text,
        model,
        ...(options?.dimensions && { dimensions: options.dimensions }),
        ...(options?.encodingFormat && { encoding_format: options.encodingFormat }),
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[] }>;
      model: string;
      usage: { prompt_tokens: number; total_tokens: number };
    };

    const result: EmbeddingResult = {
      embedding: data.data[0]?.embedding || [],
      model: data.model,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        totalTokens: data.usage.total_tokens,
      },
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  async embedBatch(texts: string[], options?: EmbeddingOptions): Promise<EmbeddingResult[]> {
    const model = options?.model || this.config.defaultModel;

    const results: EmbeddingResult[] = [];
    const uncached: { text: string; index: number }[] = [];

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (text === undefined) {
        continue;
      }

      const cacheKey = this.getCacheKey(text, model);
      if (this.cache.has(cacheKey)) {
        results[i] = this.cache.get(cacheKey)!;
      } else {
        uncached.push({ text, index: i });
      }
    }

    if (uncached.length > 0) {
      const response = await fetch(`${this.config.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
        },
        body: JSON.stringify({
          input: uncached.map(u => u.text),
          model,
          ...(options?.dimensions && { dimensions: options.dimensions }),
        }),
      });

      if (!response.ok) {
        throw new Error(`Embedding API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as {
        data: Array<{ embedding: number[]; index: number }>;
        model: string;
        usage: { prompt_tokens: number; total_tokens: number };
      };

      for (const item of data.data) {
        const result: EmbeddingResult = {
          embedding: item.embedding,
          model: data.model,
          usage: {
            promptTokens: Math.floor(data.usage.prompt_tokens / texts.length),
            totalTokens: Math.floor(data.usage.total_tokens / texts.length),
          },
        };
        const originalIndex = item.index;
        results[originalIndex] = result;
        const cacheKey = this.getCacheKey(uncached.find(u => u.index === originalIndex)!.text, model);
        this.cache.set(cacheKey, result);
      }
    }

    return results;
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same dimension');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const av = a[i]!;
      const bv = b[i]!;
      dotProduct += av * bv;
      normA += av * av;
      normB += bv * bv;
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  async search<T>(
    items: T[],
    query: string,
    getText: (item: T) => string,
    options?: {
      model?: string;
      topK?: number;
      minScore?: number;
    }
  ): Promise<SearchResult<T>[]> {
    const topK = options?.topK || 5;
    const minScore = options?.minScore || 0;

    const [queryEmbedding, itemEmbeddings] = await Promise.all([
      this.embed(query, { model: options?.model }),
      this.embedBatch(items.map(getText), { model: options?.model }),
    ]);

    const results: SearchResult<T>[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const embedding = itemEmbeddings[i];
      if (item === undefined || embedding === undefined) {
        continue;
      }

      const score = this.cosineSimilarity(queryEmbedding.embedding, embedding.embedding);
      if (score >= minScore) {
        results.push({ item, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  clearCache(): void {
    this.cache.clear();
  }
}
