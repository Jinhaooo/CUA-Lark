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
import { UITarsModel } from '@ui-tars/sdk/core';

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
        const agentModel = new UITarsModel({
          model: vlmConfig.model,
          baseURL: vlmConfig.baseURL,
          apiKey: vlmConfig.apiKey,
        });
        const agent = new GUIAgent({
          operator,
          model: agentModel,
          maxLoopCount: 25,
        });

        const trace = new JsonlTraceWriter('./traces');
        const registry = new SkillRegistry();
        await registry.loadFromFs('./packages/skills');

        const verifier = new Verifier(model);
        const skillRunner = new SkillRunner(registry, verifier, trace);
        const configLoader = new ConfigLoader();

        const ctx = {
          operator,
          agent,
          registry,
          model,
          trace,
          ocr: null,
          logger: {
            info: console.log,
            warn: console.warn,
            error: console.error,
            debug: console.debug,
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
        const result = await suiteRunner.run(globPattern);

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
