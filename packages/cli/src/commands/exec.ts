import { Command } from 'commander';
import { runPreflight, PreflightError, loadModelEnv, getVlmConfigForUiTarsSdk } from '@cua-lark/core';
import { LarkOperator } from '@cua-lark/core';
import { GUIAgent } from '@ui-tars/sdk';
import { UITarsModel } from '@ui-tars/sdk/core';

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
