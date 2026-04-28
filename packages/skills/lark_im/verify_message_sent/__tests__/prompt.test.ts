import skill from '../agent_driven';

describe('verify_message_sent skill', () => {
  test('should have correct name and kind', () => {
    expect(skill.name).toBe('lark_im.verify_message_sent');
    expect(skill.kind).toBe('agent_driven');
  });

  test('should have correct description', () => {
    expect(skill.description).toBe('验证消息是否成功发送');
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