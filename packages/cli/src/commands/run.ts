/**
 * run 命令 — M4 thin client
 * 加载 YAML 测试用例 glob，逐用例提交到后端串行执行。
 *
 * 历史上本命令直接驱动 SuiteRunner + GUIAgent + 鼠标/ESC 中断保护。
 * M4 起这些职责全部在后端：
 *  - HarnessLoop 在 server 内跑
 *  - 用户 Ctrl+C → CLI 调 DELETE /tasks/:id 触发后端 AbortController
 *  - 鼠标/ESC 中断保护：M4 范围外（M5 评估是否搬到后端）
 */

import { Command } from 'commander';
import { readFile } from 'fs/promises';
import { glob } from 'glob';
import { load as parseYaml } from 'js-yaml';
import {
  ensureBackendRunning,
  runTaskAndWait,
} from '../lib/backend-client.js';

interface CaseFile {
  name?: string;
  instruction?: string;
  cases?: Array<{ id?: string; instruction: string; params?: Record<string, unknown> }>;
}

interface CaseSummary {
  file: string;
  caseId: string;
  taskId: string;
  success: boolean;
  reason: string;
  durationMs: number;
  totalTokens: number;
}

export function createRunCommand(): Command {
  return new Command('run')
    .description('Run testcases (YAML) by submitting each case to the backend')
    .argument('<glob>', 'Glob pattern for testcase YAML files')
    .option('--quiet', 'Suppress thought stream output', false)
    .option('--no-auto-start', 'Do not auto-spawn the backend if not running')
    .action(async (globPattern: string, options: { quiet: boolean; autoStart: boolean }) => {
      try {
        await ensureBackendRunning({ autoStart: options.autoStart, silent: false });
      } catch (err) {
        console.error('Backend unavailable:', err instanceof Error ? err.message : err);
        process.exit(2);
      }

      const files = await glob(globPattern, { absolute: false, nodir: true });
      if (files.length === 0) {
        console.error(`No testcase files matched: ${globPattern}`);
        process.exit(64);
      }
      console.log(`[run] ${files.length} testcase file(s)`);

      const summaries: CaseSummary[] = [];

      for (const file of files) {
        const content = await readFile(file, 'utf-8');
        const parsed = parseYaml(content) as CaseFile;
        const cases = parsed.cases ?? (parsed.instruction ? [{ instruction: parsed.instruction }] : []);

        for (const c of cases) {
          const caseId = c.id || parsed.name || file;
          console.log(`\n========== case: ${caseId} (${file}) ==========`);

          try {
            const result = await runTaskAndWait(
              { instruction: c.instruction, params: c.params },
              { printThoughtChunks: !options.quiet, printToolCalls: !options.quiet },
            );
            summaries.push({
              file,
              caseId,
              taskId: result.taskId,
              success: result.success,
              reason: result.reason,
              durationMs: result.durationMs,
              totalTokens: result.totalTokens,
            });
          } catch (err) {
            summaries.push({
              file,
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

      console.log('\n========== summary ==========');
      const passed = summaries.filter((s) => s.success).length;
      const failed = summaries.length - passed;
      const totalTokens = summaries.reduce((sum, s) => sum + s.totalTokens, 0);
      console.log(`Total:   ${summaries.length}`);
      console.log(`Passed:  ${passed}`);
      console.log(`Failed:  ${failed}`);
      console.log(`Tokens:  ${totalTokens}`);

      if (failed > 0) {
        console.log('\nFailed cases:');
        for (const s of summaries.filter((x) => !x.success)) {
          console.log(`  - [${s.caseId}] ${s.reason}`);
        }
        process.exit(1);
      }

      process.exit(0);
    });
}
