import { describe, it, expect } from 'vitest';
import { parseSkillBody } from '../parseSkillBody.js';

describe('parseSkillBody', () => {
  it('returns empty object for empty input', () => {
    expect(parseSkillBody('')).toEqual({});
    expect(parseSkillBody('   \n  \n')).toEqual({});
  });

  it('parses task details from leading paragraph (no H2)', () => {
    const md = 'This is the task description.\n\nIt spans multiple lines.';
    const r = parseSkillBody(md);
    expect(r.taskDetails).toBeDefined();
    expect(r.taskDetails).toContain('task description');
  });

  it('parses Chinese aliases', () => {
    const md = `
## 任务目标
向当前会话发送一条消息

## 完成判据
输入框清空，消息出现在底部

## 锚点状态
- A1: 群聊已打开

## 常见陷阱
- 输入框可能被遮挡
`;
    const r = parseSkillBody(md);
    expect(r.taskDetails).toContain('向当前会话发送');
    expect(r.finishCriteria).toContain('输入框清空');
    expect(r.anchors).toContain('A1');
    expect(r.pitfalls).toContain('可能被遮挡');
  });

  it('parses English aliases', () => {
    const md = `
## Description
Send a message in the current chat

## Completion Criteria
Input clears, message appears at bottom

## Anchors
- A1: chat opened

## Common Pitfalls
- input may be hidden
`;
    const r = parseSkillBody(md);
    expect(r.taskDetails).toContain('Send a message');
    expect(r.finishCriteria).toContain('Input clears');
    expect(r.anchors).toContain('A1');
    expect(r.pitfalls).toContain('hidden');
  });

  it('handles unknown H2 sections by appending to taskDetails', () => {
    const md = `
## 任务目标
Send hello

## Random Section
Some content
`;
    const r = parseSkillBody(md);
    expect(r.taskDetails).toContain('Send hello');
    expect(r.taskDetails).toContain('Random Section');
  });

  it('skips missing sections without throwing', () => {
    const md = `## 任务目标\nDo X`;
    const r = parseSkillBody(md);
    expect(r.taskDetails).toContain('Do X');
    expect(r.finishCriteria).toBeUndefined();
    expect(r.anchors).toBeUndefined();
    expect(r.pitfalls).toBeUndefined();
  });

  it('handles real send_message SKILL.md body shape', () => {
    const md = `
# Send Message

Type \`text\` into the currently open Lark chat input and press Enter.

Completion criteria:
- The input returns to empty
- A new message appears

## Common Pitfalls

### 输入框定位失败
- 聊天窗口可能未激活

### 发送失败
- 网络延迟
`;
    const r = parseSkillBody(md);
    expect(r.taskDetails).toContain('Type');
    expect(r.pitfalls).toContain('输入框定位失败');
    expect(r.pitfalls).toContain('网络延迟');
  });
});
