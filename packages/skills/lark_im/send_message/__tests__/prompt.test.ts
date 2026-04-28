import skill from '../agent_driven';

describe('send_message skill', () => {
  test('should have correct name and kind', () => {
    expect(skill.name).toBe('lark_im.send_message');
    expect(skill.kind).toBe('agent_driven');
  });

  test('should have correct description', () => {
    expect(skill.description).toBe('在当前会话中发送文本消息');
  });

  test('should have correct params schema', () => {
    expect(skill.params.shape.text).toBeDefined();
  });

  test('execute function should be defined', () => {
    expect(typeof skill.execute).toBe('function');
  });

  test('verify function should be defined', () => {
    expect(typeof skill.verify).toBe('function');
  });
});