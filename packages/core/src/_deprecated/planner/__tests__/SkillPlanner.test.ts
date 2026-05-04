import { SkillPlanner } from '../SkillPlanner.js';
import { PlanFormatError } from '../types.js';
import { z } from 'zod';

class MockModelClient {
  private responses: string[] = [];
  private callCount = 0;

  constructor(responses: string[]) {
    this.responses = responses;
  }

  async chatText(messages: { role: string; content: string }[]): Promise<string> {
    const response = this.responses[this.callCount] || '[]';
    this.callCount++;
    return response;
  }
}

class MockSkillRegistry {
  menu() {
    return [
      {
        name: 'lark_im.search_contact',
        kind: 'procedural' as const,
        description: '搜索联系人',
        params: [{ name: 'name_pattern', type: 'string', required: true }],
      },
      {
        name: 'lark_im.send_message',
        kind: 'procedural' as const,
        description: '发送消息',
        params: [{ name: 'text', type: 'string', required: true }],
      },
    ];
  }
}

describe('SkillPlanner', () => {
  it('should return valid SkillCall array', async () => {
    const model = new MockModelClient(['[{"skill":"lark_im.send_message","params":{"text":"hello"}}]']);
    const registry = new MockSkillRegistry();
    const planner = new SkillPlanner(model, registry);

    const result = await planner.plan('发消息', {});

    expect(result).toEqual([{ skill: 'lark_im.send_message', params: { text: 'hello' } }]);
  });

  it('should retry once on invalid JSON', async () => {
    const model = new MockModelClient([
      '```json\n[{"skill":"test"}]\n```',
      '[{"skill":"lark_im.send_message","params":{"text":"hello"}}]',
    ]);
    const registry = new MockSkillRegistry();
    const planner = new SkillPlanner(model, registry);

    const result = await planner.plan('发消息', {});

    expect(result).toEqual([{ skill: 'lark_im.send_message', params: { text: 'hello' } }]);
  });

  it('should throw PlanFormatError after two failed attempts', async () => {
    const model = new MockModelClient(['invalid json', 'still invalid']);
    const registry = new MockSkillRegistry();
    const planner = new SkillPlanner(model, registry);

    await expect(planner.plan('发消息', {})).rejects.toThrow(PlanFormatError);
  });
});