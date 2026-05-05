import type { HarnessTrace } from './types.js';
import type { FailureAnalysis } from '../tools/verify/failure_analyst.js';

export interface SelfHealingConfig {
  maxRetries: number;
  minConfidence: number;
  unretryableReasons: string[];
}

const DEFAULT_CONFIG: SelfHealingConfig = {
  maxRetries: 1,
  minConfidence: 0.5,
  unretryableReasons: [
    'permission_denied',
    'risk_denied',
    'max_iterations_reached',
    'budget_exceeded',
    'tool_call_parse_failed',
  ],
};

export interface AnalyzeResult {
  confidence: number;
  rootCause: string;
  alternativeStrategy: string;
}

export type FailureTraceSummary = Pick<HarnessTrace, 'iteration' | 'thought' | 'toolCall' | 'observation'>;

export class SelfHealingExecutor {
  private config: SelfHealingConfig;

  constructor(config: Partial<SelfHealingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  shouldRetry(reason: string, retryCount: number): boolean {
    if (retryCount >= this.config.maxRetries) {
      return false;
    }

    if (this.isUnretryable(reason)) {
      return false;
    }

    return true;
  }

  private isUnretryable(reason: string): boolean {
    const lowerReason = reason.toLowerCase();
    return this.config.unretryableReasons.some(
      (unretryable) => lowerReason.includes(unretryable.toLowerCase())
    );
  }

  async analyze(
    trace: HarnessTrace[],
    reason: string,
    screenshot: string,
    failureAnalystFn: (trace: FailureTraceSummary[], reason: string, screenshot: string) => Promise<FailureAnalysis>
  ): Promise<AnalyzeResult> {
    try {
      const traceEntries = trace.slice(-10).map((entry) => ({
        iteration: entry.iteration,
        thought: entry.thought,
        toolCall: entry.toolCall,
        observation: entry.observation,
      }));

      const analysis = await failureAnalystFn(traceEntries, reason, screenshot);

      return {
        confidence: analysis.confidence,
        rootCause: analysis.rootCause,
        alternativeStrategy: analysis.alternativeStrategy,
      };
    } catch (error) {
      return {
        confidence: 0,
        rootCause: `Self-healing analysis failed: ${error}`,
        alternativeStrategy: 'Review trace manually',
      };
    }
  }

  buildRetryPrompt(originalSystemPrompt: string, analysis: AnalyzeResult): string {
    const retrySection = `

## Previous Attempt Failed
rootCause: ${analysis.rootCause}
alternativeStrategy: ${analysis.alternativeStrategy}

Please retry the task using the above strategy.
`;

    return originalSystemPrompt + retrySection;
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

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  getSkipCause(reason: string, confidence: number, retryCount: number): 'unretryable_kind' | 'low_confidence' | 'max_retries' | null {
    if (this.isUnretryable(reason)) {
      return 'unretryable_kind';
    }

    if (confidence < this.config.minConfidence) {
      return 'low_confidence';
    }

    if (retryCount >= this.config.maxRetries) {
      return 'max_retries';
    }

    return null;
  }
}
