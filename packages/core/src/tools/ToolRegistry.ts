import { z } from 'zod';
import type { Tool, ToolRegistry as ToolRegistryInterface } from './types.js';

export class ToolRegistry implements ToolRegistryInterface {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(filter?: { category?: string; whitelist?: string[] }): Tool[] {
    let result = Array.from(this.tools.values());

    if (filter?.category) {
      result = result.filter((tool) => tool.category === filter.category);
    }

    if (filter?.whitelist) {
      result = result.filter((tool) => filter.whitelist!.includes(tool.name));
    }

    return result;
  }

  toSystemPromptSection(whitelist?: string[]): string {
    const tools = this.list({ whitelist });

    if (tools.length === 0) {
      return '';
    }

    const toolDescriptions = tools.map((tool) => {
      const argsSchema = tool.argsSchema;
      const schemaDescription = this.getSchemaDescription(argsSchema);
      return `- \`${tool.name}(${schemaDescription})\`: ${tool.description}`;
    });

    return `## Available Tools

You have access to the following tools:

${toolDescriptions.join('\n')}

When calling a tool, output in JSON format:
\`\`\`json
{"thought": "your reasoning", "tool_call": {"name": "tool_name", "args": {...}}}
\`\`\`

Do not call tools that are not listed above.
`;
  }

  private getSchemaDescription(schema: unknown): string {
    try {
      if (schema instanceof z.ZodObject) {
        return Object.keys(schema.shape).map((key) => `${key}: <value>`).join(', ');
      }
      return '';
    } catch {
      return '';
    }
  }
}
