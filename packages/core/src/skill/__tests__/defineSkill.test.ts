import { defineSkill } from '../defineSkill';
import { z } from 'zod';

describe('defineSkill', () => {
  test('should create a skill with valid spec', () => {
    const skill = defineSkill({
      name: 'test-skill',
      kind: 'agent_driven',
      description: 'Test skill',
      manual: 'Manual test',
      params: z.object({}),
      execute: async () => {}
    });

    expect(skill.name).toBe('test-skill');
    expect(skill.kind).toBe('agent_driven');
    expect(skill.description).toBe('Test skill');
    expect(skill.manual).toBe('Manual test');
  });

  test('should throw error when name is missing', () => {
    expect(() => {
      defineSkill({
        name: '',
        kind: 'agent_driven',
        description: 'Test skill',
        manual: 'Manual test',
        params: z.object({}),
        execute: async () => {}
      });
    }).toThrow('Skill name is required');
  });
});