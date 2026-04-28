import { describe, it, expect } from 'vitest';
import { fuzzyDistance, fuzzyContains } from '../fuzzy.js';

describe('fuzzyDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(fuzzyDistance('hello', 'hello')).toBe(0);
    expect(fuzzyDistance('', '')).toBe(0);
  });

  it('returns correct distance for single character differences', () => {
    expect(fuzzyDistance('hello', 'hallo')).toBe(1);
    expect(fuzzyDistance('hello', 'hello!')).toBe(1);
    expect(fuzzyDistance('hello', 'ello')).toBe(1);
  });

  it('returns correct distance for multiple differences', () => {
    expect(fuzzyDistance('hello', 'hillo')).toBe(1);
    expect(fuzzyDistance('hello', 'hi')).toBe(4);
  });

  it('handles UTF-16 characters', () => {
    expect(fuzzyDistance('测试', '测试')).toBe(0);
    expect(fuzzyDistance('测试消息', '测试消息！')).toBe(1);
    expect(fuzzyDistance('Hello CUA-Lark!', 'Hello CUA-Lark')).toBe(1);
  });
});

describe('fuzzyContains', () => {
  it('returns true for exact match', () => {
    expect(fuzzyContains('Hello CUA-Lark!', 'CUA-Lark')).toBe(true);
    expect(fuzzyContains('测试消息', '测试')).toBe(true);
  });

  it('returns true for 1 character difference', () => {
    expect(fuzzyContains('Hello CUA-Lark!', 'CUA-Lark!')).toBe(true);
    expect(fuzzyContains('Hello CUA-Lark', 'CUA-Lark!')).toBe(true);
    expect(fuzzyContains('Helo CUA-Lark!', 'Hello')).toBe(true);
  });

  it('returns false for 2 character differences', () => {
    expect(fuzzyContains('Helo CUA-Lark!', 'Helloo')).toBe(false);
    expect(fuzzyContains('Hlo CUA-Lark!', 'Hello')).toBe(false);
  });

  it('handles edge cases', () => {
    expect(fuzzyContains('', '')).toBe(true);
    expect(fuzzyContains('test', '')).toBe(true);
    expect(fuzzyContains('', 'test')).toBe(false);
    expect(fuzzyContains('a', 'a')).toBe(true);
    expect(fuzzyContains('ab', 'a')).toBe(true);
  });

  it('handles mixed languages', () => {
    expect(fuzzyContains('测试消息：Hello CUA-Lark!', '测试消息：Hello CUA-Lark')).toBe(true);
    expect(fuzzyContains('测试消息：Hello CUA-Lark', '测试消息：Hello CUA-Lark!')).toBe(true);
  });
});
