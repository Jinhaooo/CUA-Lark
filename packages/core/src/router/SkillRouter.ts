import { z } from 'zod';
import type { ModelClient } from '../model/types.js';
import type { SkillTemplate } from '../harness/types.js';

export interface SkillRouter {
  route(instruction: string, ctx: Context): Promise<SkillRouteResult>;
}

export interface SkillRouteResult {
  template: SkillTemplate;
  params: Record<string, unknown>;
  confidence: number;
}

export interface Context {
  model: ModelClient;
  templates: SkillTemplate[];
}

export class SkillRouterLowConfidence extends Error {
  constructor(public confidence: number, public reason: string) {
    super(`SkillRouter low confidence ${confidence}: ${reason}`);
  }
}

const ROUTE_RESPONSE_SCHEMA = z.object({
  template_name: z.string(),
  params: z.record(z.unknown()),
  confidence: z.number().min(0).max(1),
});

export class SkillRouterImpl implements SkillRouter {
  private confidenceThreshold = 0.6;

  async route(instruction: string, ctx: Context): Promise<SkillRouteResult> {
    const templateNames = ctx.templates.map((t) => t.name).join(', ');

    const prompt = `
You are a skill router for Lark (Feishu) automation. Given a user instruction, select the most appropriate skill template.

Available skill templates:
${ctx.templates.map((t) => `- ${t.name}: ${t.description}`).join('\n')}

User instruction: ${instruction}

Output ONLY JSON format:
{
  "template_name": "<selected_template_name>",
  "params": { ... },
  "confidence": <0-1>
}

The params should extract relevant information from the instruction (e.g., chat names, text content, event titles, dates, etc.).
`.trim();

    const response = await ctx.model.chatText({
      messages: [
        { role: 'system', content: 'You are a skill routing assistant. Output ONLY valid JSON.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    });

    let parsed;
    try {
      parsed = JSON.parse(response.content);
      ROUTE_RESPONSE_SCHEMA.parse(parsed);
    } catch (error) {
      throw new SkillRouterLowConfidence(0, `Invalid response format: ${error}`);
    }

    const template = ctx.templates.find((t) => t.name === parsed.template_name);
    if (!template) {
      throw new SkillRouterLowConfidence(parsed.confidence, `Template '${parsed.template_name}' not found`);
    }

    if (parsed.confidence < this.confidenceThreshold) {
      throw new SkillRouterLowConfidence(parsed.confidence, 'Confidence below threshold');
    }

    return {
      template,
      params: parsed.params,
      confidence: parsed.confidence,
    };
  }
}