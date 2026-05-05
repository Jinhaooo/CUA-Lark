import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PromptBuilder } from '../PromptBuilder.js';
import { ToolRegistry as ToolRegistryImpl } from '../../tools/ToolRegistry.js';
import { finishedTool } from '../../tools/meta/finished.js';
import { activateLarkTool } from '../../tools/act/activate_lark.js';
import { clickTool } from '../../tools/act/click.js';
import { typeTool } from '../../tools/act/type.js';
import { screenshotTool } from '../../tools/perceive/screenshot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPTS_DIR = path.join(__dirname, '..', 'prompts');

function makeRegistry() {
  const r = new ToolRegistryImpl();
  for (const t of [finishedTool, activateLarkTool, clickTool, typeTool, screenshotTool]) {
    r.register(t as any);
  }
  return r;
}

describe('PromptBuilder', () => {
  let builder: PromptBuilder;

  beforeAll(() => {
    builder = new PromptBuilder(makeRegistry(), { promptsDir: PROMPTS_DIR });
  });

  it('build() produces a non-empty prompt for a minimal lark_ skill', () => {
    const prompt = builder.build(
      {
        name: 'lark_im.send_message',
        description: 'Send a message',
        systemPrompt: '## 任务说明\nSend hello\n',
        finishCriteria: '消息出现在底部',
        toolWhitelist: ['screenshot', 'click', 'type', 'finished', 'activate_lark'],
        maxLoopIterations: 30,
      } as any,
      { skillName: 'lark_im.send_message', markdownBody: '## 任务说明\nSend hello\n', hasAnchors: false },
    );
    expect(prompt.length).toBeGreaterThan(500);
    expect(prompt).toContain('## 思考结构');
    expect(prompt).toContain('## 可用工具');
    expect(prompt).toContain('Send a message');
  });

  it('mounts lark-window-discipline snippet for lark_ skills', () => {
    const prompt = builder.build(
      { name: 'lark_im.send_message', description: 'X', systemPrompt: '', finishCriteria: '', toolWhitelist: ['finished'], maxLoopIterations: 30 } as any,
      { skillName: 'lark_im.send_message', markdownBody: '', hasAnchors: false },
    );
    expect(prompt).toContain('飞书窗口纪律');
  });

  it('does NOT mount lark-window-discipline for non-lark skills', () => {
    const prompt = builder.build(
      { name: 'browser.search', description: 'X', systemPrompt: '', finishCriteria: '', toolWhitelist: ['finished'], maxLoopIterations: 30 } as any,
      { skillName: 'browser.search', markdownBody: '', hasAnchors: false },
    );
    expect(prompt).not.toContain('飞书窗口纪律');
  });

  it('mounts anchor-checking snippet only when hasAnchors=true', () => {
    const without = builder.build(
      { name: 'lark_im.send_message', description: 'X', systemPrompt: '', finishCriteria: '', toolWhitelist: ['finished'], maxLoopIterations: 30 } as any,
      { skillName: 'lark_im.send_message', markdownBody: '', hasAnchors: false },
    );
    const withAnchors = builder.build(
      { name: 'lark_im.send_message', description: 'X', systemPrompt: '## 锚点状态\n- A1: x', finishCriteria: '', toolWhitelist: ['finished'], maxLoopIterations: 30 } as any,
      { skillName: 'lark_im.send_message', markdownBody: '## 锚点状态\n- A1: x', hasAnchors: true },
    );
    expect(without).not.toContain('## 锚点状态校验');
    expect(withAnchors).toContain('## 锚点状态校验');
  });

  it('static prefix is identical across two builds of the same skill', () => {
    const ctx = { skillName: 'lark_im.send_message', markdownBody: '## 任务说明\nA', hasAnchors: false };
    const tmpl = { name: 'lark_im.send_message', description: 'A', systemPrompt: '## 任务说明\nA', finishCriteria: '', toolWhitelist: ['finished'], maxLoopIterations: 30 } as any;
    const p1 = builder.build(tmpl, ctx);
    const p2 = builder.build(tmpl, ctx);
    // Static prefix = everything before the first occurrence of "## 任务说明" (the first dynamic section).
    const cut = (s: string) => s.split('## 任务说明')[0]!;
    expect(cut(p1)).toBe(cut(p2));
  });

  it('renders fewshots when few-shots/ dir exists', () => {
    const skillDir = path.join(__dirname, '..', '..', '..', '..', 'skills', 'lark_im', 'send_message');
    const prompt = builder.build(
      { name: 'lark_im.send_message', description: 'send', systemPrompt: '', finishCriteria: '', toolWhitelist: ['finished'], maxLoopIterations: 30 } as any,
      { skillName: 'lark_im.send_message', markdownBody: '', hasAnchors: false, skillDir },
    );
    expect(prompt).toContain('Few-shot:');
  });

  it('throws when total budget exceeded', () => {
    // Force overflow: a fake markdownBody with 50000 chars.
    const huge = 'A'.repeat(50000);
    expect(() =>
      builder.build(
        { name: 'lark_im.send_message', description: 'X', systemPrompt: huge, finishCriteria: '', toolWhitelist: ['finished'], maxLoopIterations: 30 } as any,
        { skillName: 'lark_im.send_message', markdownBody: huge, hasAnchors: false },
      ),
    ).toThrow(/budget|exceed/i);
  });

  it('replaces all {{placeholder}} tokens — no leftovers', () => {
    const prompt = builder.build(
      { name: 'lark_im.send_message', description: 'send', systemPrompt: '', finishCriteria: '', toolWhitelist: ['finished'], maxLoopIterations: 30 } as any,
      { skillName: 'lark_im.send_message', markdownBody: '', hasAnchors: false },
    );
    expect(prompt).not.toMatch(/\{\{[^}]+\}\}/);
  });

  it('buildFromMarkdown stays backward-compatible (legacy callers)', () => {
    const legacy = builder.buildFromMarkdown('# Skill\nSome content with {{TOOLS}}', ['finished']);
    expect(legacy).toContain('finished');
    expect(legacy).not.toContain('{{TOOLS}}');
  });
});
