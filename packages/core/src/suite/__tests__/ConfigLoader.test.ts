import { ConfigLoader } from '../ConfigLoader';
import { writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('ConfigLoader', () => {
  const testConfigPath = './test-config.yaml';

  beforeEach(() => {
    if (existsSync(testConfigPath)) {
      rmSync(testConfigPath);
    }
  });

  afterEach(() => {
    if (existsSync(testConfigPath)) {
      rmSync(testConfigPath);
    }
  });

  test('should load valid config', () => {
    writeFileSync(testConfigPath, `
im:
  test_group:
    name_pattern: "CUA-Lark-Test"
    expected_member_count: 2
`);

    const loader = new ConfigLoader(testConfigPath);
    const config = loader.load();

    expect(config.im.test_group.name_pattern).toBe('CUA-Lark-Test');
    expect(config.im.test_group.expected_member_count).toBe(2);
  });

  test('should get config value by path', () => {
    writeFileSync(testConfigPath, `
im:
  test_group:
    name_pattern: "CUA-Lark-Test"
    expected_member_count: 2
`);

    const loader = new ConfigLoader(testConfigPath);
    const namePattern = loader.get<string>('im.test_group.name_pattern');
    const memberCount = loader.get<number>('im.test_group.expected_member_count');

    expect(namePattern).toBe('CUA-Lark-Test');
    expect(memberCount).toBe(2);
  });

  test('should throw error for invalid config', () => {
    writeFileSync(testConfigPath, `im: [`);

    const loader = new ConfigLoader(testConfigPath);
    expect(() => loader.load()).toThrow();
  });

  test('should throw error for non-existent config path', () => {
    writeFileSync(testConfigPath, `
im:
  test_group:
    name_pattern: "CUA-Lark-Test"
    expected_member_count: 2
`);

    const loader = new ConfigLoader(testConfigPath);
    expect(() => loader.get('non.existent.path')).toThrow('Config path not found: non.existent.path');
  });
});
