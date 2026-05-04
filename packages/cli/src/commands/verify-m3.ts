/**
 * verify-m3 命令 — M4 thin client
 * 跑 M3 验收套件（IM 3 + Cal 3 + Docs 3）N 轮，写 final 报告。
 *
 * 不再 spawn 子进程跑本地 SuiteRunner —— 全部通过后端。
 */

import { Command } from 'commander';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import {
  ensureBackendRunning,
  runTaskAndWait,
} from '../lib/backend-client.js';

const M3_CASES: { id: string; instruction: string }[] = [
  { id: 'im_01_search_open_chat',    instruction: 'Search for the contact "测试群" and open the chat.' },
  { id: 'im_02_send_text',           instruction: 'In the currently open chat, send the text "Hello from CUA".' },
  { id: 'im_03_send_and_verify',     instruction: 'Send the text "verify-me" and verify it appears in the chat history.' },
  { id: 'cal_01_open_calendar',      instruction: 'Open Lark Calendar.' },
  { id: 'cal_02_create_event',       instruction: 'Create a calendar event titled "M3 verify event".' },
  { id: 'cal_03_create_with_time',   instruction: 'Create a calendar event titled "M3 verify event" tomorrow 3pm.' },
  { id: 'doc_01_open_docs',          instruction: 'Open Lark Docs.' },
  { id: 'doc_02_create_doc',         instruction: 'Create a new blank Lark document.' },
  { id: 'doc_03_create_with_content', instruction: 'Create a new Lark document titled "M3" with body "verify".' },
];

interface RoundSummary {
  round: number;
  results: { caseId: string; taskId: string; success: boolean; reason: string; durationMs: number; totalTokens: number }[];
  durationMs: number;
}

export function createVerifyM3Command(): Command {
  return new Command('verify-m3')
    .description('Run the M3 acceptance suite (9 cases) and write the final M3c report')
    .option('--runs <n>', 'Number of repeated runs', '1')
    .option('--report <path>', 'Markdown report path', 'bench-reports/m3c-final-9-tests.md')
    .option('--quiet', 'Suppress thought stream output', false)
    .option('--no-auto-start', 'Do not auto-spawn the backend if not running')
    .action(async (options: { runs: string; report: string; quiet: boolean; autoStart: boolean }) => {
      try {
        await ensureBackendRunning({ autoStart: options.autoStart, silent: false });
      } catch (err) {
        console.error('Backend unavailable:', err instanceof Error ? err.message : err);
        process.exit(2);
      }

      const runs = Math.max(1, Number.parseInt(options.runs, 10) || 1);
      const summaries: RoundSummary[] = [];

      for (let i = 1; i <= runs; i += 1) {
        console.log(`\n[M3] Run ${i}/${runs}`);
        const roundStart = Date.now();
        const results: RoundSummary['results'] = [];

        for (const c of M3_CASES) {
          console.log(`\n--- ${c.id} ---`);
          try {
            const result = await runTaskAndWait(
              { instruction: c.instruction },
              { printThoughtChunks: !options.quiet, printToolCalls: !options.quiet },
            );
            results.push({
              caseId: c.id,
              taskId: result.taskId,
              success: result.success,
              reason: result.reason,
              durationMs: result.durationMs,
              totalTokens: result.totalTokens,
            });
          } catch (err) {
            results.push({
              caseId: c.id,
              taskId: '',
              success: false,
              reason: err instanceof Error ? err.message : String(err),
              durationMs: 0,
              totalTokens: 0,
            });
          }
        }

        summaries.push({
          round: i,
          results,
          durationMs: Date.now() - roundStart,
        });
      }

      writeReport(options.report, summaries);
      const totalFailed = summaries.flatMap((s) => s.results).filter((r) => !r.success).length;
      console.log(`\nM3 verification report written to ${options.report}`);
      process.exit(totalFailed > 0 ? 1 : 0);
    });
}

function writeReport(path: string, summaries: RoundSummary[]): void {
  mkdirSync(dirname(path), { recursive: true });

  const totalRuns = summaries.length;
  const caseIds = summaries[0]?.results.map((r) => r.caseId) ?? [];

  let md = `# M3 Final 9 Tests\n\n`;
  md += `Runs: ${totalRuns}\n\n`;
  md += `| Case | ` + summaries.map((s) => `R${s.round}`).join(' | ') + ` | Pass rate |\n`;
  md += `|---|` + summaries.map(() => '---').join('|') + `|---:|\n`;

  for (const caseId of caseIds) {
    const cells = summaries.map((s) => {
      const r = s.results.find((x) => x.caseId === caseId);
      return r?.success ? '✓' : '✗';
    });
    const passes = cells.filter((c) => c === '✓').length;
    const rate = `${((passes / totalRuns) * 100).toFixed(0)}%`;
    md += `| ${caseId} | ${cells.join(' | ')} | ${rate} |\n`;
  }

  md += `\n## Failed details\n\n`;
  for (const s of summaries) {
    for (const r of s.results.filter((x) => !x.success)) {
      md += `- Run ${s.round} · ${r.caseId}: ${r.reason} (taskId=${r.taskId})\n`;
    }
  }

  writeFileSync(path, md, 'utf-8');
}
