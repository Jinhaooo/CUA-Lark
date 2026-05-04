import type { ModelClient } from '../../model/types.js';
import type { SkillRegistry } from '../../skill/SkillRegistry.js';
import type { PlannerContext, PlanAttempt } from './types.js';
import { PlanFormatError, PlanTooLongError } from './types.js';
import { PlanSchema, type SkillCallList } from './PlanSchema.js';
import { buildSystemPrompt } from './prompts/system.js';
import { FEW_SHOTS } from './prompts/few-shots.js';

export class SkillPlanner {
  private model: ModelClient;
  private registry: SkillRegistry;

  constructor(model: ModelClient, registry: SkillRegistry) {
    this.model = model;
    this.registry = registry;
  }

  async plan(instruction: string, _ctx: PlannerContext): Promise<SkillCallList> {
    const attempts: PlanAttempt[] = [];
    const maxAttempts = 2;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const menu = this.registry.menu();
      let systemPrompt = buildSystemPrompt(menu);
      const previousAttempt = attempts.at(-1);

      if (attempt > 0 && previousAttempt?.zodError) {
        systemPrompt = `<retry-correction>错误内容: ${previousAttempt.zodError.message}。请严格按 schema 输出，不要包含 markdown</retry-correction>\n\n${systemPrompt}`;
      }

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...FEW_SHOTS.flatMap((shot) => [
          { role: 'user' as const, content: shot.user },
          { role: 'assistant' as const, content: shot.assistant },
        ]),
        { role: 'user' as const, content: instruction },
      ];

      const response = await this.model.chatText({ messages });
      attempts.push({ prompt: systemPrompt, response: response.content });

      try {
        const parsed = JSON.parse(response.content) as unknown;
        return PlanSchema.parse(parsed);
      } catch (error) {
        const zodError = { message: error instanceof Error ? error.message : 'Unknown parsing error' } as any;
        attempts.at(-1)!.zodError = zodError;

        if (error instanceof Error && error.message.includes('Array must contain at most 10 element')) {
          throw new PlanTooLongError(attempts);
        }

        if (attempt < maxAttempts - 1) {
          continue;
        }

        throw new PlanFormatError(attempts);
      }
    }

    throw new PlanFormatError(attempts);
  }

}
