import type { ToolRegistry } from '../tools/types.js';
import type { SkillTemplate, HarnessTrace } from './types.js';

export class PromptBuilder {
  private toolRegistry: ToolRegistry;

  constructor(toolRegistry: ToolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  build(template: SkillTemplate): string {
    const parts: string[] = [];

    parts.push(`You are a task-oriented assistant for Lark (Feishu) desktop client.`);
    parts.push(`Your goal: ${template.description}`);
    parts.push('');

    parts.push('## Task Objective');
    parts.push(template.systemPrompt);
    parts.push('');

    parts.push('## Completion Criteria');
    parts.push(template.finishCriteria);
    parts.push('');

    parts.push('## Available Tools');
    const tools = this.toolRegistry.toSystemPromptSection(template.toolWhitelist);
    parts.push(tools);
    parts.push('');

    if (template.fewShots && template.fewShots.length > 0) {
      parts.push('## Examples');
      template.fewShots.forEach((shot: HarnessTrace[], index: number) => {
        parts.push(`### Example ${index + 1}`);
        shot.forEach((step: HarnessTrace) => {
          parts.push(`- Thought: ${step.thought}`);
          parts.push(`  Action: ${step.toolCall.name}(${JSON.stringify(step.toolCall.args)})`);
          parts.push(`  Observation: ${step.observation}`);
        });
      });
      parts.push('');
    }

    parts.push('## Output Format');
    parts.push('You MUST output in JSON format:');
    parts.push('```json');
    parts.push('{"thought": "your reasoning here", "tool_call": {"name": "tool_name", "args": {...}}}');
    parts.push('```');
    parts.push('');
    parts.push('Do NOT include any other text outside the JSON block.');

    return parts.join('\n');
  }

  buildFromMarkdown(markdownContent: string, toolWhitelist?: string[]): string {
    const toolsSection = this.toolRegistry.toSystemPromptSection(toolWhitelist);
    return markdownContent.replace('{{TOOLS}}', toolsSection);
  }
}