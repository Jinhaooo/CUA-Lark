import { Command } from 'commander';
import { runPreflight, PreflightError, loadModelEnv, getVlmConfigForUiTarsSdk } from '@cua-lark/core';
import { LarkOperator } from '@cua-lark/core';
import { GUIAgent } from '@ui-tars/sdk';
import { UITarsModel } from '@ui-tars/sdk/core';

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
};

export function createExecCommand() {
  return new Command('exec')
    .description('Execute a natural language instruction using CUA-Lark')
    .argument('<instruction>', 'The natural language instruction to execute')
    .option('-m, --max-loop <number>', 'Maximum number of loops', '25')
    .action(async (instruction: string, options: { maxLoop: string }) => {
      if (!instruction || instruction.trim() === '') {
        console.error('Error: Instruction cannot be empty');
        process.exit(64);
      }

      try {
        await runPreflight();
      } catch (error) {
        if (error instanceof PreflightError) {
          console.error(`Preflight failed [${error.kind}]: ${error.message}`);
          process.exit(2);
        }
        throw error;
      }

      try {
        const env = loadModelEnv();
        const vlmConfig = getVlmConfigForUiTarsSdk(env.vlm);

        const operator = new LarkOperator();

        const model = new UITarsModel({
          model: vlmConfig.model,
          baseURL: vlmConfig.baseURL,
          apiKey: vlmConfig.apiKey,
        });

        const maxLoopCount = parseInt(options.maxLoop, 10) || 25;

        let agentError: unknown = null;

        const agent = new GUIAgent({
          operator,
          model,
          maxLoopCount,
          logger: redactingLogger,
          onError: ({ error }) => {
            agentError = error;
          },
        });

        await agent.run(instruction);
        if (agentError) {
          throw agentError;
        }

        process.exit(0);
      } catch (error) {
        console.error('Execution failed:', error);
        process.exit(1);
      }
    });
}
