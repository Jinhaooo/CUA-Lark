import { buildSystemPrompt } from '../system.js';

describe('buildSystemPrompt', () => {
  it('should generate proper system prompt', () => {
    const menu = [
      {
        name: 'lark_im.send_message',
        kind: 'procedural' as const,
        description: '发送消息',
        params: [{ name: 'text', type: 'string', required: true }],
      },
    ];

    const prompt = buildSystemPrompt(menu);

    expect(prompt).toContain('lark_im.send_message');
    expect(prompt).toContain('text');
    expect(prompt).toContain('发送消息');
  });

  it('should truncate long descriptions', () => {
    const menu = [
      {
        name: 'test',
        kind: 'procedural' as const,
        description: 'a'.repeat(100),
        params: [],
      },
    ];

    const prompt = buildSystemPrompt(menu);

    expect(prompt).toContain('a'.repeat(50) + '...');
  });
});