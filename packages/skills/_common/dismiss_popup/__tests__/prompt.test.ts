import skill from '../agent_driven';

describe('dismiss_popup skill', () => {
  test('should have correct name and kind', () => {
    expect(skill.name).toBe('_common.dismiss_popup');
    expect(skill.kind).toBe('agent_driven');
  });

  test('should have correct description', () => {
    expect(skill.description).toBe('关闭与测试任务无关的弹窗');
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