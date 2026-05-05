/**
 * Token budget enforcement for prompt assembly.
 *
 * Double-counts via @anthropic-ai/tokenizer (Claude family) and js-tiktoken
 * (GPT-4 family); uses the max as the conservative value so neither model
 * can over-consume.
 */
import { countTokens as anthropicCount } from '@anthropic-ai/tokenizer';
import { encodingForModel, type Tiktoken } from 'js-tiktoken';

let cachedTiktoken: Tiktoken | null = null;
function getTiktoken(): Tiktoken {
  if (cachedTiktoken) return cachedTiktoken;
  cachedTiktoken = encodingForModel('gpt-4');
  return cachedTiktoken;
}

export interface TokenCount {
  anthropic: number;
  tiktoken: number;
  max: number;
}

export function countTokens(text: string): TokenCount {
  if (!text) return { anthropic: 0, tiktoken: 0, max: 0 };
  const a = anthropicCount(text);
  const t = getTiktoken().encode(text).length;
  return { anthropic: a, tiktoken: t, max: Math.max(a, t) };
}

export class PromptBudgetExceeded extends Error {
  constructor(
    public readonly promptName: string,
    public readonly actual: number,
    public readonly max: number,
  ) {
    super(`PromptBudgetExceeded: '${promptName}' uses ${actual} tokens, max is ${max}`);
    this.name = 'PromptBudgetExceeded';
  }
}

export function assertBudget(name: string, text: string, max: number): void {
  const { max: actual } = countTokens(text);
  if (actual > max) {
    throw new PromptBudgetExceeded(name, actual, max);
  }
}

/** Centralised budgets for the prompt pipeline (spec § 7.4). */
export const PROMPT_BUDGETS = {
  base: 800,
  snippet: 150,
  snippetsTotal: 800,
  skillInstance: 400,
  fewshots: 1500,
  total: 3000,
} as const;
