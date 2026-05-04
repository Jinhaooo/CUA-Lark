import { SkillRegistry } from '../SkillRegistry';
import { defineSkill } from '../defineSkill';
import { z } from 'zod';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  test('should register and get a skill', () => {
    const skill = defineSkill({
      name: 'test-skill',
      kind: 'agent_driven',
      description: 'Test skill',
      manual: 'Manual test',
      params: z.object({}),
      execute: async () => {}
    });

    registry.register(skill);
    expect(registry.get('test-skill')).toBe(skill);
  });

  test('should throw error for duplicate skill', () => {
    const skill = defineSkill({
      name: 'test-skill',
      kind: 'agent_driven',
      description: 'Test skill',
      manual: 'Manual test',
      params: z.object({}),
      execute: async () => {}
    });

    registry.register(skill);
    expect(() => registry.register(skill)).toThrow('Duplicate skill: test-skill');
  });

  test('should list all skills', () => {
    const skill1 = defineSkill({
      name: 'skill1',
      kind: 'agent_driven',
      description: 'Test skill 1',
      manual: 'Manual test 1',
      params: z.object({}),
      execute: async () => {}
    });

    const skill2 = defineSkill({
      name: 'skill2',
      kind: 'procedural',
      description: 'Test skill 2',
      manual: 'Manual test 2',
      params: z.object({}),
      execute: async () => {}
    });

    registry.register(skill1);
    registry.register(skill2);

    const skills = registry.list();
    expect(skills.length).toBe(2);
    expect(skills).toContain(skill1);
    expect(skills).toContain(skill2);
  });

  test('should load skills from filesystem', async () => {
    const testDir = './test-skills';
    const skillDir = join(testDir, 'test-skill');
    
    // 创建测试目录和文件
    mkdirSync(skillDir, { recursive: true });
    
    // 创建SKILL.md
    writeFileSync(join(skillDir, 'SKILL.md'), `---
name: test-skill
kind: agent_driven
description: Test skill
---

Test skill documentation`);
    
    // 创建技能实现文件
    writeFileSync(join(skillDir, 'agent_driven.ts'), `
import { defineSkill } from '../../src/skill/defineSkill.ts';
import { z } from 'zod';

export default defineSkill({
  name: 'test-skill',
  kind: 'agent_driven',
  description: 'Test skill',
  manual: 'Manual test',
  params: z.object({}),
  execute: async () => {}
});
`);

    const distSkillDir = join(testDir, 'dist', 'test-skill');
    mkdirSync(distSkillDir, { recursive: true });
    writeFileSync(join(distSkillDir, 'agent_driven.js'), `
export default {
  name: 'test-skill',
  kind: 'agent_driven',
  description: 'Test skill',
  manual: 'Manual test',
  params: {},
  execute: async () => {}
};
`);

    try {
      await registry.loadFromFs(testDir);
      const skill = registry.get('test-skill');
      expect(skill).toBeDefined();
      expect(skill?.name).toBe('test-skill');
    } finally {
      // 清理测试目录
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    }
  });
});
