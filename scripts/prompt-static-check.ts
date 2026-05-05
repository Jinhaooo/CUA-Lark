/**
 * Static checks for the prompt assembly pipeline.
 *
 * Run: pnpm tsx scripts/prompt-static-check.ts
 *
 * Exits non-zero if any check fails. Intended for CI + pre-merge gate.
 *
 * Checks (matches plan § 8.1):
 *   C1 — base + each snippet within their static budgets
 *   C2 — every loaded skill renders within total budget (≤ 7000 tk)
 *   C3 — same skill rendered twice yields identical static prefix (cache friendly)
 *   C4 — no leftover {{placeholder}} tokens after render
 *   C5 — base.system.md contains required H2 sections
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Use relative paths into packages/core/dist so the script can run from the
// repo root without depending on pnpm workspace symlinks. `pnpm build` (core)
// must have been run first.
import {
  PromptBuilder,
  ToolRegistryImpl,
  SkillRegistry,
  finishedTool,
  callUserTool,
  askUserTool,
  recordEvidenceTool,
  screenshotTool,
  ocrLocateTool,
  waitForLoadingTool,
  clickTool,
  typeTool,
  hotkeyTool,
  scrollTool,
  dragTool,
  waitTool,
  activateLarkTool,
  verifyOcrTool,
  verifyA11yTool,
} from '../packages/core/dist/index.js';
import { countTokens, PROMPT_BUDGETS } from '../packages/core/dist/harness/promptBudget.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

function check(name: string, ok: boolean, detail?: string): CheckResult {
  return { name, ok, detail };
}

async function main(): Promise<void> {
  const results: CheckResult[] = [];

  // Tool registry — load common tools so toolWhitelist resolution works.
  const toolRegistry = new ToolRegistryImpl();
  for (const t of [
    finishedTool,
    callUserTool,
    askUserTool,
    recordEvidenceTool,
    screenshotTool,
    ocrLocateTool,
    waitForLoadingTool,
    clickTool,
    typeTool,
    hotkeyTool,
    scrollTool,
    dragTool,
    waitTool,
    activateLarkTool,
    verifyOcrTool,
    verifyA11yTool,
  ]) {
    if (t) toolRegistry.register(t as never);
  }

  // C1 partial — PromptBuilder constructor enforces base ≤ 800 + every snippet ≤ 150.
  let builder: PromptBuilder;
  try {
    builder = new PromptBuilder(toolRegistry);
    results.push(check('C1 · base + snippets static budget', true));
  } catch (e) {
    results.push(check('C1 · base + snippets static budget', false, String(e)));
    finalize(results);
    return;
  }

  // Load all skills
  const skillRegistry = new SkillRegistry();
  await skillRegistry.loadFromFs(path.join(repoRoot, 'packages', 'skills'));
  const skills = skillRegistry.list() as Array<{
    name: string;
    description?: string;
    systemPrompt?: string;
    finishCriteria?: string;
    maxLoopIterations?: number;
    toolWhitelist?: string[];
    sideEffects?: unknown;
    skillDir?: string;
  }>;

  console.log(`Loaded ${skills.length} skills`);

  // C2 + C4 + C5 — render every skill, check budget + placeholder + base sections present
  for (const s of skills) {
    const tmpl = {
      name: s.name,
      description: s.description ?? '',
      systemPrompt: s.systemPrompt ?? '',
      finishCriteria: s.finishCriteria ?? '',
      maxLoopIterations: s.maxLoopIterations ?? 30,
      toolWhitelist: s.toolWhitelist,
      sideEffects: s.sideEffects,
      skillDir: s.skillDir,
    } as never;
    const ctx = {
      skillName: s.name,
      markdownBody: s.systemPrompt ?? '',
      hasAnchors: /^##\s+(锚点状态|Anchors)\s*$/m.test(s.systemPrompt ?? ''),
      skillDir: s.skillDir,
    };

    let rendered: string;
    try {
      rendered = builder.build(tmpl, ctx);
    } catch (e) {
      results.push(check(`C2 · render:${s.name}`, false, String(e)));
      continue;
    }

    const t = countTokens(rendered).max;
    results.push(
      check(`C2 · render:${s.name} ≤ ${PROMPT_BUDGETS.total}`, t <= PROMPT_BUDGETS.total, `tokens=${t}`),
    );

    const leftovers = rendered.match(/\{\{[^}]+\}\}/g);
    results.push(
      check(`C4 · placeholders:${s.name}`, !leftovers, leftovers?.join(', ')),
    );

    const required = ['## 思考结构', '## 工具调用契约', '## 输出格式', '## 可用工具'];
    const missing = required.filter((h) => !rendered.includes(h));
    results.push(
      check(`C5 · sections:${s.name}`, missing.length === 0, missing.join(', ')),
    );
  }

  // C3 — same skill rendered twice produces identical static prefix
  if (skills.length > 0) {
    const s = skills[0]!;
    const tmpl = {
      name: s.name,
      description: s.description ?? '',
      systemPrompt: s.systemPrompt ?? '',
      finishCriteria: s.finishCriteria ?? '',
      maxLoopIterations: 30,
      toolWhitelist: s.toolWhitelist,
      skillDir: s.skillDir,
    } as never;
    const ctx = {
      skillName: s.name,
      markdownBody: s.systemPrompt ?? '',
      hasAnchors: /^##\s+(锚点状态|Anchors)\s*$/m.test(s.systemPrompt ?? ''),
      skillDir: s.skillDir,
    };
    const a = builder.build(tmpl, ctx);
    const b = builder.build(tmpl, ctx);
    const cut = (x: string) => x.split('## 任务说明')[0]!;
    results.push(check('C3 · static prefix consistency', cut(a) === cut(b)));
  }

  finalize(results);
}

function finalize(results: CheckResult[]): void {
  let pass = 0;
  let fail = 0;
  for (const r of results) {
    const tag = r.ok ? '✓' : '✗';
    console.log(`${tag} ${r.name}${r.detail ? `   [${r.detail}]` : ''}`);
    r.ok ? pass++ : fail++;
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(2);
});
