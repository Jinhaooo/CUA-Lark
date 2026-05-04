/**
 * bench 命令 — M4 thin client
 * 把一组 NL 用例多轮提交到后端，输出汇总报告。
 *
 * --detach：提交后立即退出，不等执行；用户去 dashboard 看进度。
 */

import { Command } from 'commander';
import { readFile } from 'fs/promises';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { load as parseYaml } from 'js-yaml';
import {
  ensureBackendRunning,
  postTask,
  runTaskAndWait,
} from '../lib/backend-client.js';

interface BenchCaseFile {
  name?: string;
  cases?: Array<{ id?: string; instruction: string; params?: Record<string, unknown> }>;
}

interface RunResult {
  caseId: string;
  taskId: string;
  success: boolean;
  reason: string;
  durationMs: number;
  totalTokens: number;
}

export function createBenchCommand(): Command {
  return new Command('bench')
    .description('Run a benchmark suite (one yaml file with multiple cases) for N rounds')
    .argument('<file>', 'YAML file with bench cases')
    .option('--rounds <n>', 'Number of rounds per case', '5')
    .option('--detach', 'Submit tasks and exit immediately (use dashboard to watch)', false)
    .option('--report <path>', 'Markdown report output path', 'bench-reports/bench-result.md')
    .option('--quiet', 'Suppress thought stream output', false)
    .option('--no-auto-start', 'Do not auto-spawn the backend if not running')
    .action(async (
      file: string,
      options: { rounds: string; detach: boolean; report: string; quiet: boolean; autoStart: boolean },
    ) => {
      try {
        await ensureBackendRunning({ autoStart: options.autoStart, silent: false });
      } catch (err) {
        console.error('Backend unavailable:', err instanceof Error ? err.message : err);
        process.exit(2);
      }

      const rounds = Math.max(1, Number.parseInt(options.rounds, 10) || 1);

      const content = await readFile(file, 'utf-8');
      const parsed = parseYaml(content) as BenchCaseFile;
      const cases = parsed.cases ?? [];
      if (cases.length === 0) {
        console.error(`No cases found in ${file}`);
        process.exit(64);
      }

      console.log(`[bench] ${cases.length} cases × ${rounds} rounds = ${cases.length * rounds} tasks`);

      if (options.detach) {
        const submitted: { caseId: string; taskId: string }[] = [];
        for (let r = 1; r <= rounds; r += 1) {
          for (const c of cases) {
            const { taskId } = await postTask({ instruction: c.instruction, params: c.params });
            submitted.push({ caseId: c.id || c.instruction.slice(0, 40), taskId });
            console.log(`  [submitted r${r}] ${c.id || ''} → ${taskId}`);
          }
        }
        console.log(`\n[bench] ${submitted.length} tasks submitted in detach mode. Watch progress in the dashboard.`);
        process.exit(0);
      }

      const results: RunResult[] = [];

      for (let r = 1; r <= rounds; r += 1) {
        console.log(`\n=== round ${r}/${rounds} ===`);
        for (const c of cases) {
          const caseId = c.id || c.instruction.slice(0, 40);
          console.log(`\n--- case: ${caseId} (round ${r}) ---`);
          try {
            const result = await runTaskAndWait(
              { instruction: c.instruction, params: c.params },
              { printThoughtChunks: !options.quiet, printToolCalls: !options.quiet },
            );
            results.push({
              caseId,
              taskId: result.taskId,
              success: result.success,
              reason: result.reason,
              durationMs: result.durationMs,
              totalTokens: result.totalTokens,
            });
          } catch (err) {
            results.push({
              caseId,
              taskId: '',
              success: false,
              reason: err instanceof Error ? err.message : String(err),
              durationMs: 0,
              totalTokens: 0,
            });
          }
        }
      }

      writeReport(options.report, file, rounds, results);

      const passed = results.filter((r) => r.success).length;
      console.log(`\n[bench] ${passed}/${results.length} passed; report → ${options.report}`);
      process.exit(passed === results.length ? 0 : 1);
    });
}

function writeReport(path: string, sourceFile: string, rounds: number, results: RunResult[]): void {
  mkdirSync(dirname(path), { recursive: true });

  const byCase = new Map<string, RunResult[]>();
  for (const r of results) {
    const list = byCase.get(r.caseId) ?? [];
    list.push(r);
    byCase.set(r.caseId, list);
  }

  let md = `# Bench Report\n\n`;
  md += `Source: \`${sourceFile}\` × ${rounds} rounds\n\n`;
  md += `| Case | Pass | Total | Pass rate | Avg tokens | Avg duration (ms) |\n`;
  md += `|---|---:|---:|---:|---:|---:|\n`;
  for (const [caseId, runs] of byCase) {
    const passes = runs.filter((r) => r.success).length;
    const avgTokens = Math.round(runs.reduce((s, r) => s + r.totalTokens, 0) / runs.length);
    const avgDur = Math.round(runs.reduce((s, r) => s + r.durationMs, 0) / runs.length);
    md += `| ${caseId} | ${passes} | ${runs.length} | ${(passes / runs.length * 100).toFixed(0)}% | ${avgTokens} | ${avgDur} |\n`;
  }
  writeFileSync(path, md, 'utf-8');
}
