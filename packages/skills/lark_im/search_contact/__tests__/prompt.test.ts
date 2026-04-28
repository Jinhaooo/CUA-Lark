import skill from '../agent_driven';

describe('search_contact skill', () => {
  test('should have correct name and kind', () => {
    expect(skill.name).toBe('lark_im.search_contact');
    expect(skill.kind).toBe('agent_driven');
  });

  test('should have correct description', () => {
    expect(skill.description).toBe('搜索联系人或群组并打开会话');
  });

  test('should have correct params schema', () => {
    expect(skill.params.shape.name_pattern).toBeDefined();
  });

  test('execute function should be defined', () => {
    expect(typeof skill.execute).toBe('function');
  });

  test('verify function should be defined', () => {
    expect(typeof skill.verify).toBe('function');
  });
});