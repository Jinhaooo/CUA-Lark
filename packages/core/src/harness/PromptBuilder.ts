import type { ToolRegistry } from '../tools/types.js';
import type { SkillTemplate, HarnessTrace } from './types.js';

export class PromptBuilder {
  private toolRegistry: ToolRegistry;

  constructor(toolRegistry: ToolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  build(template: SkillTemplate): string {
    const parts: string[] = [];

    parts.push(`你是飞书（Lark）桌面客户端的任务执行助手。请始终用中文进行思考（thought）和回答。`);
    parts.push(`本次任务目标：${template.description}`);
    parts.push('');

    if (template.systemPrompt && template.systemPrompt.trim()) {
      parts.push('## 任务说明');
      parts.push(template.systemPrompt);
      parts.push('');
    }

    if (template.finishCriteria && template.finishCriteria.trim()) {
      parts.push('## 完成判据');
      parts.push(template.finishCriteria);
      parts.push('');
    }

    parts.push('## 可用工具');
    const tools = this.toolRegistry.toSystemPromptSection(template.toolWhitelist);
    parts.push(tools);
    parts.push('');

    if (template.fewShots && template.fewShots.length > 0) {
      parts.push('## 示例');
      template.fewShots.forEach((shot: HarnessTrace[], index: number) => {
        parts.push(`### 示例 ${index + 1}`);
        shot.forEach((step: HarnessTrace) => {
          parts.push(`- Thought: ${step.thought}`);
          parts.push(`  Action: ${step.toolCall.name}(${JSON.stringify(step.toolCall.args)})`);
          parts.push(`  Observation: ${step.observation}`);
        });
      });
      parts.push('');
    }

    parts.push('## 输出格式');
    parts.push('你必须严格输出以下 JSON（thought 字段用中文）：');
    parts.push('```json');
    parts.push('{"thought": "本步推理（中文）", "tool_call": {"name": "工具名", "args": {...}}}');
    parts.push('```');
    parts.push('不要在 JSON 之外输出任何额外文字。任何场景都必须以工具调用作为回应——包括任务已完成时也必须调用 `finished` 工具，例如：');
    parts.push('```json');
    parts.push('{"thought": "消息已发送成功，任务完成。", "tool_call": {"name": "finished", "args": {"success": true, "reason": "消息已发送"}}}');
    parts.push('```');
    parts.push('避免连续多次重复同一动作（例如反复 screenshot），每一步都要在前一步观察基础上推进。');

    return parts.join('\n');
  }

  buildFromMarkdown(markdownContent: string, toolWhitelist?: string[]): string {
    const toolsSection = this.toolRegistry.toSystemPromptSection(toolWhitelist);
    return markdownContent.replace('{{TOOLS}}', toolsSection);
  }
}