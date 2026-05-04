export interface ParsedToolCall {
  thought: string;
  toolCall: { name: string; args: unknown };
}

export class ToolCallParser {
  parse(response: string): ParsedToolCall {
    const trimmed = response.trim();

    const jsonMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        return this.parseJson(jsonMatch[1]);
      } catch {
      }
    }

    try {
      return this.parseJson(trimmed);
    } catch {
    }

    const functionMatch = trimmed.match(/(\w+)\s*\(\s*({[\s\S]*})\s*\)/);
    if (functionMatch && functionMatch[1] && functionMatch[2]) {
      try {
        return {
          thought: '',
          toolCall: {
            name: functionMatch[1],
            args: JSON.parse(functionMatch[2]),
          },
        };
      } catch {
      }
    }

    throw new Error('Failed to parse tool call');
  }

  private parseJson(jsonString: string): ParsedToolCall {
    const parsed = JSON.parse(jsonString);
    
    const toolCall = parsed.tool_call || parsed.toolCall;
    
    if (!toolCall || typeof toolCall.name !== 'string') {
      throw new Error('Invalid tool call format');
    }

    const name: string = toolCall.name;

    return {
      thought: parsed.thought || '',
      toolCall: {
        name,
        args: toolCall.args || {},
      },
    };
  }

  tryParse(response: string): ParsedToolCall | null {
    try {
      return this.parse(response);
    } catch {
      return null;
    }
  }
}