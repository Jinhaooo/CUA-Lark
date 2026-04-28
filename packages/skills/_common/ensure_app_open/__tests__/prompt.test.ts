import skill from '../agent_driven';

describe('ensure_app_open skill', () => {
  test('should have correct name and kind', () => {
    expect(skill.name).toBe('_common.ensure_app_open');
    expect(skill.kind).toBe('agent_driven');
  });

  test('should have correct description', () => {
    expect(skill.description).toBe('确保飞书应用打开并显示IM主面板');
  });

  test('should have empty params schema', () => {
    expect(skill.params.shape).toEqual({});
  });

  test('execute function should be defined', () => {
    expect(typeof skill.execute).toBe('function');
  });

  test('verify function should be defined', () => {
    expect(typeof skill.verify).toBe('function');
  });
});