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

/**
 * Centralised budgets for the prompt pipeline.
 *
 * Spec § 7.4 originally set these for English/mixed content; real-world
 * Chinese-heavy prompts hit tiktoken ~2-3x harder than @anthropic-ai/tokenizer
 * (and ~2x harder than the actual qwen-family VLM tokenizer). To keep the
 * double-count `max()` ceiling honest, budgets are scaled up so practical
 * Chinese content can fit. Raw cost on the real VLM stays ~2x lower.
 *
 * Spec deviation logged in plans/Prompt-Engineering-Tasks.md (Phase 2 first run).
 */
export const PROMPT_BUDGETS = {
  base: 1500,           // was 800 → 1000 → 1500 (added 启动序列 + 平台限制 sections)
  snippet: 700,         // was 150 → 320 → 360 → 420 → 700 (tool-heuristics 加 IM 最短路径段)
  snippetsTotal: 3000,  // was 800 → 1800 → 2200 → 2400 → 3000 — 4 required + 2 conditional
  skillInstance: 800,   // was 400 — Chinese SKILL.md body is ~2x
  fewshots: 3500,       // was 1500 — Chinese fewshots heavy on tiktoken
  total: 8000,          // was 3000 → 7000 → 7500 → 8000 (sum + headroom for loaded skill bodies)
} as const;
