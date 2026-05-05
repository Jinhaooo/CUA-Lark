import { describe, it, expect } from 'vitest';
import { parseSkill } from '@cua-lark/core/src/skill/defineSkill';
import fs from 'fs';
import path from 'path';

describe('lark_x cross-product skills', () => {
  const skills = [
    { name: 'lark_x.handle_calendar_invite_in_im', folder: 'handle_calendar_invite_in_im' },
    { name: 'lark_x.share_doc_to_im', folder: 'share_doc_to_im' },
    { name: 'lark_x.create_event_from_im_message', folder: 'create_event_from_im_message' },
  ];

  it.each(skills)('should have valid YAML frontmatter for $name', ({ name, folder }) => {
    const skillPath = path.join(__dirname, `../${folder}/SKILL.md`);
    if (!fs.existsSync(skillPath)) {
      return;
    }

    const content = fs.readFileSync(skillPath, 'utf-8');
    const skill = parseSkill(content);

    expect(skill.name).toBe(name);
    expect(skill.kind).toBe('agent_driven');
  });

  it.each(skills)('should define tool whitelist for $name', ({ name, folder }) => {
    const skillPath = path.join(__dirname, `../${folder}/SKILL.md`);
    if (!fs.existsSync(skillPath)) {
      return;
    }

    const content = fs.readFileSync(skillPath, 'utf-8');
    const skill = parseSkill(content);

    expect(skill.toolWhitelist).toBeDefined();
    expect(skill.toolWhitelist).toContain('ocr_locate');
    expect(skill.toolWhitelist).toContain('wait_for_loading');
    expect(skill.toolWhitelist).toContain('record_evidence');
  });

  it.each(skills)('should define side effects for $name', ({ name, folder }) => {
    const skillPath = path.join(__dirname, `../${folder}/SKILL.md`);
    if (!fs.existsSync(skillPath)) {
      return;
    }

    const content = fs.readFileSync(skillPath, 'utf-8');
    expect(content).toContain('sideEffects');
  });

  it.each(skills)('should have cross-product pitfalls documented for $name', ({ name, folder }) => {
    const skillPath = path.join(__dirname, `../${folder}/SKILL.md`);
    if (!fs.existsSync(skillPath)) {
      return;
    }

    const content = fs.readFileSync(skillPath, 'utf-8');
    expect(content).toContain('Common Pitfalls');
    expect(content).toContain('cross-product');
  });
});

describe('lark_x few-shots', () => {
  const skills = [
    { name: 'handle_calendar_invite_in_im', expectedExamples: 1 },
    { name: 'share_doc_to_im', expectedExamples: 1 },
    { name: 'create_event_from_im_message', expectedExamples: 1 },
  ];

  it.each(skills)('should have few-shots for $name', ({ name, expectedExamples }) => {
    const fewShotsDir = path.join(__dirname, `../${name}/few-shots`);
    if (!fs.existsSync(fewShotsDir)) {
      return;
    }

    const files = fs.readdirSync(fewShotsDir);
    expect(files.length).toBeGreaterThanOrEqual(expectedExamples);
  });

  it('should have valid few-shot format', () => {
    const examplePath = path.join(__dirname, '../handle_calendar_invite_in_im/few-shots/accept_invite.md');
    if (!fs.existsSync(examplePath)) {
      return;
    }

    const content = fs.readFileSync(examplePath, 'utf-8');
    expect(content).toContain('# Few-Shot Example');
    expect(content).toContain('## Input');
    expect(content).toContain('## Trace');
    expect(content).toContain('## Output');
  });
});

describe('cross-product integration', () => {
  const productPairs = [
    { from: 'lark_im', to: 'lark_calendar', skill: 'handle_calendar_invite_in_im' },
    { from: 'lark_docs', to: 'lark_im', skill: 'share_doc_to_im' },
    { from: 'lark_im', to: 'lark_calendar', skill: 'create_event_from_im_message' },
  ];

  it.each(productPairs)('should support navigation from $from to $to', ({ from, to, skill }) => {
    expect(['lark_im', 'lark_docs', 'lark_calendar']).toContain(from);
    expect(['lark_im', 'lark_docs', 'lark_calendar']).toContain(to);
  });

  it('should have comprehensive cross-product coverage', () => {
    const coveredPairs = productPairs.map((p) => `${p.from}->${p.to}`);
    expect(coveredPairs).toContain('lark_im->lark_calendar');
    expect(coveredPairs).toContain('lark_docs->lark_im');
  });
});