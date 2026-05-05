import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ToolRegistry } from '../tools/types.js';
import type { SkillTemplate } from './types.js';
import { parseSkillBody } from './parseSkillBody.js';
import { assertBudget, countTokens, PROMPT_BUDGETS } from './promptBudget.js';

export interface SkillContext {
  skillName: string;
  markdownBody: string;
  hasAnchors: boolean;
  /** Optional absolute path to the skill directory; used to load few-shots. */
  skillDir?: string;
}

const REQUIRED_SNIPPETS = [
  'state-diff-reasoning',
  'tool-selection-heuristics',
  'loop-prevention',
  'finished-criteria',
] as const;

const CONDITIONAL_SNIPPETS = ['anchor-checking', 'lark-window-discipline'] as const;

const SECTION_SEPARATOR = '\n\n---\n\n';

const __dirname_safe = (() => {
  try { return path.dirname(fileURLToPath(import.meta.url)); } catch { return process.cwd(); }
})();

export class PromptBuilder {
  private toolRegistry: ToolRegistry;
  private base: string;
  private snippets: Map<string, string>;

  constructor(toolRegistry: ToolRegistry, opts?: { promptsDir?: string }) {
    this.toolRegistry = toolRegistry;
    const dir = opts?.promptsDir ?? PromptBuilder.resolveDefaultPromptsDir();
    this.base = readFileSync(path.join(dir, 'base.system.md'), 'utf8').trim();
    this.snippets = new Map();
    const snippetsDir = path.join(dir, 'snippets');
    for (const name of [...REQUIRED_SNIPPETS, ...CONDITIONAL_SNIPPETS]) {
      const filePath = path.join(snippetsDir, `${name}.md`);
      if (!existsSync(filePath)) {
        throw new Error(`PromptBuilder: missing snippet ${filePath}`);
      }
      this.snippets.set(name, readFileSync(filePath, 'utf8').trim());
    }
    this.assertStaticBudget();
  }

  /**
   * Locate the prompts dir at runtime. From compiled dist (`dist/harness/`) the
   * .md files don't exist (TypeScript doesn't copy assets), so we fall back to
   * `src/harness/prompts/`. From src (vitest / direct ts-node run) the
   * sibling prompts/ dir works directly.
   */
  private static resolveDefaultPromptsDir(): string {
    const candidates = [
      path.join(__dirname_safe, 'prompts'),
      path.join(__dirname_safe, '..', '..', 'src', 'harness', 'prompts'),
    ];
    for (const c of candidates) {
      if (existsSync(path.join(c, 'base.system.md'))) return c;
    }
    return candidates[0]!; // first will produce a clear ENOENT
  }

  private assertStaticBudget(): void {
    assertBudget('base', this.base, PROMPT_BUDGETS.base);
    for (const [name, content] of this.snippets) {
      assertBudget(`snippet:${name}`, content, PROMPT_BUDGETS.snippet);
    }
  }

  build(template: SkillTemplate, ctx?: SkillContext): string {
    const sections: string[] = [];

    // STATIC region
    sections.push(this.base);
    sections.push(this.selectSnippets(ctx).join('\n\n'));

    // DYNAMIC region
    sections.push(this.renderSkillInstance(template, ctx));
    const fewshots = this.renderFewshots(ctx);
    if (fewshots) sections.push(fewshots);

    const final = sections.filter(Boolean).join(SECTION_SEPARATOR);
    assertBudget('total', final, PROMPT_BUDGETS.total);
    return final;
  }

  /** Backward-compatible legacy entrypoint (M3.5 callers). */
  buildFromMarkdown(markdownContent: string, toolWhitelist?: string[]): string {
    const tools = this.toolRegistry.toSystemPromptSection(toolWhitelist);
    return markdownContent.replace('{{TOOLS}}', tools);
  }

  // ---- internals ----

  private selectSnippets(ctx?: SkillContext): string[] {
    const out: string[] = [];
    for (const name of REQUIRED_SNIPPETS) out.push(this.snippets.get(name)!);
    if (ctx?.hasAnchors) out.push(this.snippets.get('anchor-checking')!);
    if (ctx?.skillName?.startsWith('lark_')) out.push(this.snippets.get('lark-window-discipline')!);
    return out;
  }

  private renderSkillInstance(template: SkillTemplate, ctx?: SkillContext): string {
    const body = ctx?.markdownBody ?? (template as { systemPrompt?: string }).systemPrompt ?? '';
    const parsed = parseSkillBody(body);

    const parts: string[] = [];

    // 1. 任务说明
    const taskBlock = [template.description, parsed.taskDetails].filter(Boolean).join('\n\n');
    parts.push(`## 任务说明\n\n${taskBlock || template.description || ''}`);

    // 2. 完成判据
    const finishCriteria = parsed.finishCriteria ?? (template as { finishCriteria?: string }).finishCriteria;
    if (finishCriteria && finishCriteria.trim()) {
      parts.push(`## 完成判据\n\n${finishCriteria.trim()}`);
    }

    // 3. 锚点状态 (only when present)
    if (parsed.anchors && parsed.anchors.trim()) {
      parts.push(`## 锚点状态\n\n${parsed.anchors.trim()}`);
    }

    // 4. 常见陷阱
    if (parsed.pitfalls && parsed.pitfalls.trim()) {
      parts.push(`## 常见陷阱\n\n${truncateByTokens(parsed.pitfalls.trim(), 300)}`);
    }

    // 5. 可用工具
    parts.push(`## 可用工具\n\n${this.toolRegistry.toSystemPromptSection(template.toolWhitelist)}`);

    return parts.join('\n\n');
  }

  private renderFewshots(ctx?: SkillContext): string {
    if (!ctx?.skillDir) return '';
    const dir = path.join(ctx.skillDir, 'few-shots');
    if (!existsSync(dir)) return '';
    const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
    if (files.length === 0) return '';

    const blocks: string[] = [];
    let used = 0;
    for (const f of files) {
      const content = readFileSync(path.join(dir, f), 'utf8').trim();
      const t = countTokens(content).max;
      if (used + t > PROMPT_BUDGETS.fewshots) break;
      blocks.push(`<example>\n${content}\n</example>`);
      used += t;
      if (blocks.length >= 5) break;
    }
    if (blocks.length === 0) return '';
    return `## 示例\n\n${blocks.join('\n\n')}`;
  }
}

function truncateByTokens(text: string, maxTokens: number): string {
  const t = countTokens(text).max;
  if (t <= maxTokens) return text;
  // Coarse truncate by character ratio; append marker.
  const ratio = maxTokens / t;
  const cut = Math.max(50, Math.floor(text.length * ratio) - 20);
  return text.slice(0, cut) + '…(truncated)';
}
