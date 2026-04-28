import { Command } from 'commander';
import {
  ConfigLoader,
  getVlmConfigForUiTarsSdk,
  JsonlTraceWriter,
  LarkOperator,
  loadModelEnv,
  ModelClientImpl,
  runPreflight,
  SkillRegistry,
  SkillRunner,
  SuiteRunner,
  Verifier,
} from '@cua-lark/core';
import { GUIAgent } from '@ui-tars/sdk';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { join, dirname } from 'path';

function redactSecrets(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(/("apiKey"\s*:\s*")[^"]+(")/gi, '$1[REDACTED]$2')
      .replace(/("authorization"\s*:\s*")[^"]+(")/gi, '$1[REDACTED]$2')
      .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[REDACTED]')
      .replace(/(ark-[A-Za-z0-9-]{8})[A-Za-z0-9-]+/g, '$1-[REDACTED]');
  }

  if (value instanceof Error) {
    value.message = redactSecrets(value.message) as string;
    if (value.stack) {
      value.stack = redactSecrets(value.stack) as string;
    }
    return value;
  }

  return value;
}

const redactingLogger = {
  log: (...args: unknown[]) => console.log(...args.map(redactSecrets)),
  info: (...args: unknown[]) => console.info(...args.map(redactSecrets)),
  warn: (...args: unknown[]) => console.warn(...args.map(redactSecrets)),
  error: (...args: unknown[]) => console.error(...args.map(redactSecrets)),
  debug: (...args: unknown[]) => console.debug(...args.map(redactSecrets)),
};

class UserAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserAbortError';
  }
}

function isEnvEnabled(name: string, defaultValue = false): boolean {
  const value = process.env[name];
  if (value === undefined) {
    return defaultValue;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

async function startMouseMoveAbortGuard(
  operator: LarkOperator,
  abortController: AbortController,
  logger: typeof redactingLogger,
): Promise<() => void> {
  if (!isEnvEnabled('CUA_ABORT_ON_MOUSE_MOVE')) {
    return () => {};
  }

  const thresholdPx = Number(process.env.CUA_ABORT_MOUSE_MOVE_PX || 24);
  const intervalMs = Number(process.env.CUA_ABORT_MOUSE_POLL_MS || 120);
  let baseline = await operator.getMousePosition();
  let lastAgentMoveAt = 0;

  const timer = setInterval(async () => {
    if (abortController.signal.aborted) {
      return;
    }

    try {
      const current = await operator.getMousePosition();
      if (operator.isExecuting()) {
        baseline = current;
        lastAgentMoveAt = Date.now();
        return;
      }

      if (Date.now() - lastAgentMoveAt < 300) {
        baseline = current;
        return;
      }

      const distance = Math.hypot(current.x - baseline.x, current.y - baseline.y);
      if (distance >= thresholdPx) {
        logger.warn(`Mouse moved ${Math.round(distance)}px by user; aborting GUI run.`);
        abortController.abort(new UserAbortError('User moved the mouse; aborting active GUI run.'));
      }
    } catch (error) {
      logger.warn('Mouse abort guard failed:', error);
    }
  }, intervalMs);

  return () => clearInterval(timer);
}

function startEscAbortGuard(
  abortController: AbortController,
  logger: typeof redactingLogger,
): () => void {
  if (!isEnvEnabled('CUA_ABORT_ON_ESC', true)) {
    return () => {};
  }

  if (process.platform === 'win32') {
    return startWindowsGlobalEscAbortGuard(abortController, logger);
  }

  return startStdinEscAbortGuard(abortController, logger);
}

function startWindowsGlobalEscAbortGuard(
  abortController: AbortController,
  logger: typeof redactingLogger,
): () => void {
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class KeyboardState {
  [DllImport("user32.dll")]
  public static extern short GetAsyncKeyState(int vKey);
}
"@
while ($true) {
  Start-Sleep -Milliseconds 80
  if (([KeyboardState]::GetAsyncKeyState(0x1B) -band 0x8000) -ne 0) {
    Write-Output "ESC"
    [Console]::Out.Flush()
    break
  }
}
`;

  let child: ChildProcessWithoutNullStreams | null = spawn(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true },
  );

  child.stdout.on('data', (chunk) => {
    if (String(chunk).includes('ESC') && !abortController.signal.aborted) {
      logger.warn('Global ESC pressed; aborting GUI run.');
      abortController.abort(new UserAbortError('Global ESC pressed; aborting active GUI run.'));
    }
  });

  child.on('error', (error) => {
    logger.warn('Global ESC abort guard failed:', error);
  });

  return () => {
    if (child && !child.killed) {
      child.kill();
    }
    child = null;
  };
}

function startStdinEscAbortGuard(
  abortController: AbortController,
  logger: typeof redactingLogger,
): () => void {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    logger.warn('ESC abort guard is unavailable because stdin is not an interactive TTY.');
    return () => {};
  }

  const wasRaw = input.isRaw;
  input.setEncoding('utf8');
  input.setRawMode(true);
  input.resume();

  const onData = (chunk: string) => {
    if (chunk === '\u001b' && !abortController.signal.aborted) {
      logger.warn('ESC pressed; aborting GUI run.');
      abortController.abort(new UserAbortError('ESC pressed; aborting active GUI run.'));
    }
  };

  input.on('data', onData);

  return () => {
    input.off('data', onData);
    if (!wasRaw) {
      input.setRawMode(false);
    }
    input.pause();
  };
}

interface BenchRoundResult {
  round: number;
  timestamp: string;
  suiteResult: SuiteResult;
  runId: string;
}

interface SuiteResult {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  cases: { id: string; passed: boolean; error?: string; durationMs: number }[];
}

interface BenchSummary {
  label: string;
  suite: string;
  runs: number;
  timestamp: string;
  vlmModel: string;
  vlmBaseURL: string;
  passRate: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  avgTokens: number;
  totalTokens: number;
  cases: Array<{
    id: string;
    passRate: number;
    avgMs: number;
    results: Array<{ round: number; passed: boolean; error?: string; durationMs: number }>;
  }>;
}

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor((percentile / 100) * (sorted.length - 1));
  return sorted[index] ?? 0;
}

async function generateReport(summary: BenchSummary): Promise<string> {
  const caseRows = summary.cases.map(c => {
    const roundResults = summary.runs > 1 
      ? c.results.map(r => r.passed ? '✓' : '✗').join(' | ')
      : (c.results[0]?.passed ?? false) ? '✓' : '✗';
    
    return `| ${c.id} | ${roundResults} | ${Math.round(c.passRate)}% |`;
  }).join('\n');

  const roundHeaders = summary.runs > 1
    ? Array.from({ length: summary.runs }, (_, i) => `轮 ${i + 1}`).join(' | ')
    : '结果';

  return `# Benchmark · ${summary.label}

- 时间：${summary.timestamp}
- 套件：${summary.suite}，用例数：${summary.cases.length}
- 轮数：${summary.runs}
- VLM model：${summary.vlmModel}
- VLM baseURL：${summary.vlmBaseURL}

## 通过率矩阵（用例 × 轮）

| 用例 | ${roundHeaders} | 通过率 |
|---|---|---|
${caseRows}

**整体通过率**：${Math.round(summary.passRate)}%（${summary.cases.reduce((acc, c) => acc + c.results.filter(r => r.passed).length, 0)}/${summary.cases.length * summary.runs}）

## 性能

| 指标 | 平均 | P50 | P95 |
|---|---|---|---|
| 单用例耗时（s） | ${(summary.avgMs / 1000).toFixed(2)} | ${(summary.p50Ms / 1000).toFixed(2)} | ${(summary.p95Ms / 1000).toFixed(2)} |
| 单用例 token 消耗 | ${summary.avgTokens.toFixed(0)} | - | - |

## 失败案例

${summary.cases.filter(c => c.passRate < 100).length === 0 ? '无' : summary.cases
    .filter(c => c.passRate < 100)
    .map(c => `- 用例 \`${c.id}\`：${c.results.filter(r => !r.passed).length} 次失败`)
    .join('\n')}
`;
}

export function createBenchCommand(): Command {
  return new Command('bench')
    .description('Run benchmark on test suites')
    .option('--suite <suite>', 'Test suite to run (im|all)', 'im')
    .option('--runs <n>', 'Number of rounds to run', '5')
    .option('--label <label>', 'Label for the benchmark run', 'benchmark')
    .option('--testcases <glob>', 'Glob pattern for test cases')
    .action(async (options) => {
      try {
        await runPreflight();

        const { suite, runs: runsStr, label, testcases } = options;
        const runs = parseInt(runsStr, 10);
        const globPattern = testcases || `testcases/${suite}/*.yaml`;

        const env = loadModelEnv();
        const vlmConfig = getVlmConfigForUiTarsSdk(env.vlm);

        const outputDir = join('./runs', label);
        const rawDir = join(outputDir, 'raw');
        await mkdir(rawDir, { recursive: true });

        const roundResults: BenchRoundResult[] = [];

        for (let round = 1; round <= runs; round++) {
          console.log(`\n=== Round ${round}/${runs} ===`);
          
          const abortController = new AbortController();
          const operator = new LarkOperator();
          const model = new ModelClientImpl(env.vlm, env.llm);
          let agentError: unknown = null;

          const agent = new GUIAgent({
            operator,
            model: {
              model: vlmConfig.model,
              baseURL: vlmConfig.baseURL,
              apiKey: vlmConfig.apiKey,
            },
            maxLoopCount: 25,
            signal: abortController.signal,
            logger: redactingLogger,
            onError: ({ error }) => {
              agentError = error;
            },
          });

          const checkedAgent = {
            run: async (instruction: string) => {
              if (abortController.signal.aborted) {
                throw abortController.signal.reason || new UserAbortError('User aborted active GUI run.');
              }
              agentError = null;
              await agent.run(instruction);
              if (abortController.signal.aborted) {
                throw abortController.signal.reason || new UserAbortError('User aborted active GUI run.');
              }
              if (agentError) {
                throw agentError;
              }
            },
          };

          const trace = new JsonlTraceWriter('./traces');
          const registry = new SkillRegistry();
          await registry.loadFromFs('./packages/skills');

          const verifier = new Verifier(model);
          const skillRunner = new SkillRunner(registry, verifier, trace);
          const configLoader = new ConfigLoader();

          const ctx = {
            operator,
            agent: checkedAgent,
            registry,
            model,
            trace,
            ocr: null,
            logger: {
              info: redactingLogger.info,
              warn: redactingLogger.warn,
              error: redactingLogger.error,
              debug: redactingLogger.debug,
            },
            config: configLoader.load(),
            snapshot: async () => {
              const screenshot = await operator.screenshot();
              return { screenshotBase64: screenshot.base64 };
            },
            runSkill: async (name: string, params: Record<string, unknown>) => {
              return skillRunner.run({ skill: name, params }, ctx);
            },
          };

          const suiteRunner = new SuiteRunner(skillRunner, ctx);
          const stopMouseGuard = await startMouseMoveAbortGuard(operator, abortController, redactingLogger);
          const stopEscGuard = startEscAbortGuard(abortController, redactingLogger);

          try {
            const suiteResult = await suiteRunner.run(globPattern);
            roundResults.push({
              round,
              timestamp: new Date().toISOString(),
              suiteResult,
              runId: `bench-${label}-round-${round}`,
            });

            console.log(`Round ${round} completed: ${suiteResult.passed}/${suiteResult.total} passed`);
          } catch (error) {
            console.log(`Round ${round} failed:`, error);
            roundResults.push({
              round,
              timestamp: new Date().toISOString(),
              suiteResult: {
                total: 0,
                passed: 0,
                failed: 0,
                durationMs: 0,
                cases: [],
              },
              runId: `bench-${label}-round-${round}`,
            });
          } finally {
            stopMouseGuard();
            stopEscGuard();
          }

          await writeFile(join(rawDir, `round-${round}.json`), JSON.stringify(roundResults[round - 1], null, 2));
        }

        const allCaseIds = [...new Set(roundResults.flatMap(r => r.suiteResult.cases.map(c => c.id)))];
        const allDurations = roundResults.flatMap(r => r.suiteResult.cases.map(c => c.durationMs));

        const summary: BenchSummary = {
          label,
          suite,
          runs,
          timestamp: new Date().toISOString(),
          vlmModel: vlmConfig.model,
          vlmBaseURL: vlmConfig.baseURL,
          passRate: roundResults.length > 0
            ? (roundResults.reduce((acc, r) => acc + r.suiteResult.passed, 0) / 
               roundResults.reduce((acc, r) => acc + r.suiteResult.total, 0)) * 100
            : 0,
          avgMs: allDurations.length > 0 ? allDurations.reduce((a, b) => a + b, 0) / allDurations.length : 0,
          p50Ms: calculatePercentile(allDurations, 50),
          p95Ms: calculatePercentile(allDurations, 95),
          avgTokens: 0,
          totalTokens: 0,
          cases: allCaseIds.map(id => {
            const results = roundResults.map(r => {
              const caseResult = r.suiteResult.cases.find(c => c.id === id);
              return {
                round: r.round,
                passed: caseResult?.passed ?? false,
                error: caseResult?.error,
                durationMs: caseResult?.durationMs ?? 0,
              };
            });
            const passedCount = results.filter(r => r.passed).length;
            const avgMs = results.reduce((a, b) => a + b.durationMs, 0) / results.length;
            return {
              id,
              passRate: (passedCount / results.length) * 100,
              avgMs,
              results,
            };
          }),
        };

        await writeFile(join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2));
        const report = await generateReport(summary);
        await writeFile(join(outputDir, 'report.md'), report);

        console.log(`\n=== Benchmark Complete ===`);
        console.log(`Report: ${join(outputDir, 'report.md')}`);
        console.log(`Summary: ${join(outputDir, 'summary.json')}`);
        console.log(`Raw data: ${rawDir}`);
        console.log(`Overall pass rate: ${Math.round(summary.passRate)}%`);

        process.exit(0);
      } catch (error) {
        console.error('Error running benchmark:', error);
        process.exit(1);
      }
    });
}