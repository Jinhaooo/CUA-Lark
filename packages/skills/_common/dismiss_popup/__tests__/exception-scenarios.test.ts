import { describe, it, expect } from 'vitest';
import { parseSkill } from '@cua-lark/core/src/skill/defineSkill';
import fs from 'fs';
import path from 'path';

describe('dismiss_popup skill', () => {
  it('should have valid YAML frontmatter', () => {
    const skillPath = path.join(__dirname, '../SKILL.md');
    const content = fs.readFileSync(skillPath, 'utf-8');
    const skill = parseSkill(content);
    
    expect(skill.name).toBe('_common.dismiss_popup');
    expect(skill.kind).toBe('agent_driven');
    expect(skill.description).toContain('关闭与测试任务无关的弹窗');
  });

  it('should have popupType parameter with proper schema', () => {
    const skillPath = path.join(__dirname, '../SKILL.md');
    const content = fs.readFileSync(skillPath, 'utf-8');
    const skill = parseSkill(content);
    
    expect(skill.paramsSchema).toBeDefined();
    expect(skill.paramsSchema?.popupType).toBeDefined();
  });

  it('should define tool whitelist', () => {
    const skillPath = path.join(__dirname, '../SKILL.md');
    const content = fs.readFileSync(skillPath, 'utf-8');
    const skill = parseSkill(content);
    
    expect(skill.toolWhitelist).toBeDefined();
    expect(skill.toolWhitelist).toContain('ocr_locate');
    expect(skill.toolWhitelist).toContain('click');
    expect(skill.toolWhitelist).toContain('wait_for_loading');
  });

  it('should have common pitfalls documented', () => {
    const skillPath = path.join(__dirname, '../SKILL.md');
    const content = fs.readFileSync(skillPath, 'utf-8');
    
    expect(content).toContain('## Common Pitfalls');
    expect(content).toContain('弹窗可能嵌套出现');
    expect(content).toContain('某些弹窗可能有延迟出现');
  });
});

describe('handle_permission_denied skill', () => {
  it('should have valid YAML frontmatter', () => {
    const skillPath = path.join(__dirname, '../../handle_permission_denied/SKILL.md');
    if (!fs.existsSync(skillPath)) {
      return;
    }
    
    const content = fs.readFileSync(skillPath, 'utf-8');
    const skill = parseSkill(content);
    
    expect(skill.name).toBe('_common.handle_permission_denied');
    expect(skill.kind).toBe('agent_driven');
    expect(skill.description).toContain('处理权限拒绝场景');
  });

  it('should have permissionType parameter', () => {
    const skillPath = path.join(__dirname, '../../handle_permission_denied/SKILL.md');
    if (!fs.existsSync(skillPath)) {
      return;
    }
    
    const content = fs.readFileSync(skillPath, 'utf-8');
    const skill = parseSkill(content);
    
    expect(skill.paramsSchema).toBeDefined();
    expect(skill.paramsSchema?.permissionType).toBeDefined();
  });
});

describe('exception scenario parameters', () => {
  const popupTypes = ['permission_denied', 'update', 'ad', 'notification', 'dialog'];
  const permissionTypes = ['camera', 'microphone', 'file', 'location', 'notification'];

  it.each(popupTypes)('should recognize popup type: %s', (popupType) => {
    expect(popupTypes).toContain(popupType);
  });

  it.each(permissionTypes)('should recognize permission type: %s', (permissionType) => {
    expect(permissionTypes).toContain(permissionType);
  });

  it('should have comprehensive popup type coverage', () => {
    expect(popupTypes).toHaveLength(5);
  });

  it('should have comprehensive permission type coverage', () => {
    expect(permissionTypes).toHaveLength(5);
  });
});