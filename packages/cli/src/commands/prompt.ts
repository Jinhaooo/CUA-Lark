/**
 * prompt 命令 — M4 thin client
 * 把用户输入的 prompt 当作 instruction 提交给后端的 HarnessLoop。
 * （历史上本命令直接跑本地 HarnessLoop；M4 已统一通过后端 HTTP/SSE。）
 */

import { Command } from 'commander';
import {
  ensureBackendRunning,
  runTaskAndWait,
} from '../lib/backend-client.js';

export function createPromptCommand(): Command {
  return new Command('prompt')
    .description('Submit a single prompt to the backend HarnessLoop')
    .argument('[prompt...]', 'Natural-language task prompt')
    .option('--max-iterations <n>', 'Maximum HarnessLoop iterations (forwarded as params.maxLoopIterations)')
    .option('--quiet', 'Suppress thought stream output', false)
    .option('--no-auto-start', 'Do not auto-spawn the backend if not running')
    .action(async (
      promptParts: string[],
      options: { maxIterations?: string; quiet: boolean; autoStart: boolean },
    ) => {
      const prompt = promptParts.join(' ').trim();
      if (!prompt) {
        console.error('Error: prompt cannot be empty');
        process.exit(64);
      }

      try {
        await ensureBackendRunning({ autoStart: options.autoStart, silent: false });
      } catch (err) {
        console.error('Backend unavailable:', err instanceof Error ? err.message : err);
        process.exit(2);
      }

      const params: Record<string, unknown> = {};
      if (options.maxIterations) {
        const n = Number(options.maxIterations);
        if (Number.isFinite(n) && n > 0) params.maxLoopIterations = n;
      }

      try {
        const result = await runTaskAndWait(
          { instruction: prompt, params },
          {
            printThoughtChunks: !options.quiet,
            printToolCalls: !options.quiet,
          },
        );
        process.exit(result.success ? 0 : 1);
      } catch (err) {
        console.error('prompt failed:', err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });
}
