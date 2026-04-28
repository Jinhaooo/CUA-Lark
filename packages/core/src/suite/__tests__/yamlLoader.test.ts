import { YamlLoader } from '../yamlLoader';
import { ConfigLoader } from '../ConfigLoader';
import { writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('YamlLoader', () => {
  const testConfigPath = './test-config.yaml';
  const testYamlPath = './test-testcase.yaml';

  beforeEach(() => {
    if (existsSync(testConfigPath)) {
      rmSync(testConfigPath);
    }
    if (existsSync(testYamlPath)) {
      rmSync(testYamlPath);
    }
  });

  afterEach(() => {
    if (existsSync(testConfigPath)) {
      rmSync(testConfigPath);
    }
    if (existsSync(testYamlPath)) {
      rmSync(testYamlPath);
    }
  });

  test('should load test case and replace variables', () => {
    // Create config file
    writeFileSync(testConfigPath, `
im:
  test_group:
    name_pattern: "CUA-Lark-Test"
    expected_member_count: 2
`);

    // Create test case file with variables
    writeFileSync(testYamlPath, `
id: im_01_search_open_chat
title: 搜索测试群并打开
tags: [im, smoke]
timeoutSeconds: 60
expectations:
  - 右侧消息区切换到测试群
skillCalls:
  - skill: _common.ensure_app_open
    params: {}
  - skill: _common.dismiss_popup
    params: {}
  - skill: lark_im.search_contact
    params:
      name_pattern: ${'${'}config:im.test_group.name_pattern${'}'}
`);

    const configLoader = new ConfigLoader(testConfigPath);
    const yamlLoader = new YamlLoader(configLoader);
    const testCase = yamlLoader.load(testYamlPath);

    expect(testCase.id).toBe('im_01_search_open_chat');
    expect(testCase.skillCalls![2].params.name_pattern).toBe('CUA-Lark-Test');
  });

  test('should throw error for non-existent config variable', () => {
    // Create config file
    writeFileSync(testConfigPath, `
im:
  test_group:
    name_pattern: "CUA-Lark-Test"
`);

    // Create test case file with non-existent variable
    writeFileSync(testYamlPath, `
id: test
skillCalls:
  - skill: test-skill
    params:
      value: ${'${'}config:non.existent.path${'}'}
`);

    const configLoader = new ConfigLoader(testConfigPath);
    const yamlLoader = new YamlLoader(configLoader);
    expect(() => yamlLoader.load(testYamlPath)).toThrow('Config variable not found: non.existent.path');
  });
});