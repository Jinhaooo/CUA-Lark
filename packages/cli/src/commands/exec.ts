/**
 * exec 命令 — M4 thin client
 * 提交单条 NL 指令到本地后端，订阅 SSE 实时打印。
 */

import { Command } from 'commander';
import {
  ensureBackendRunning,
  runTaskAndWait,
} from '../lib/backend-client.js';

export function createExecCommand() {
  return new Command('exec')
    .description('Submit a natural-language instruction to the CUA-Lark backend')
    .argument('<instruction>', 'The natural language instruction to execute')
    .option('--quiet', 'Suppress thought stream output', false)
    .option('--no-auto-start', 'Do not auto-spawn the backend if not running')
    .action(async (instruction: string, options: { quiet: boolean; autoStart: boolean }) => {
      if (!instruction || instruction.trim() === '') {
        console.error('Error: Instruction cannot be empty');
        process.exit(64);
      }

      try {
        await ensureBackendRunning({ autoStart: options.autoStart, silent: false });
      } catch (err) {
        console.error('Backend unavailable:', err instanceof Error ? err.message : err);
        process.exit(2);
      }

      try {
        const result = await runTaskAndWait(
          { instruction },
          {
            printThoughtChunks: !options.quiet,
            printToolCalls: !options.quiet,
          },
        );
        process.exit(result.success ? 0 : 1);
      } catch (err) {
        console.error('exec failed:', err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });
}
