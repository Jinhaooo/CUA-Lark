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

export function createRunCommand(): Command {
  return new Command('run')
    .description('Run test cases')
    .argument('<glob>', 'Glob pattern for test case files')
    .action(async (globPattern: string) => {
      try {
        await runPreflight();

        const env = loadModelEnv();
        const vlmConfig = getVlmConfigForUiTarsSdk(env.vlm);

        const operator = new LarkOperator();
        const model = new ModelClientImpl(env.vlm, env.llm);
        let agentError: unknown = null;
        const abortController = new AbortController();
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
        const result = await suiteRunner.run(globPattern).finally(() => {
          stopMouseGuard();
          stopEscGuard();
        });

        console.log('\nTest Results:');
        console.log(`Total: ${result.total}`);
        console.log(`Passed: ${result.passed}`);
        console.log(`Failed: ${result.failed}`);
        console.log(`Duration: ${result.durationMs}ms`);

        if (result.failed > 0) {
          console.log('\nFailed cases:');
          result.cases.forEach((caseResult) => {
            if (!caseResult.passed) {
              console.log(`- ${caseResult.id}: ${caseResult.error}`);
            }
          });
          process.exit(1);
        }

        console.log('\nAll tests passed!');
        process.exit(0);
      } catch (error) {
        console.error('Error running tests:', error);
        process.exit(1);
      }
    });
}
