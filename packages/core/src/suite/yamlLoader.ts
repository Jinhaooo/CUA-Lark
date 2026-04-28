import { readFileSync } from 'fs';
import yaml from 'js-yaml';
import type { TestCaseFile } from './types.js';
import { ConfigLoader } from './ConfigLoader.js';

export class YamlLoader {
  private configLoader: ConfigLoader;

  constructor(configLoader: ConfigLoader) {
    this.configLoader = configLoader;
  }

  load(filePath: string): TestCaseFile {
    try {
      const content = readFileSync(filePath, 'utf8');
      let testCase = yaml.load(content) as TestCaseFile;
      testCase = this.replaceVariables(testCase);
      return testCase;
    } catch (error) {
      throw new Error(`Failed to load test case: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private replaceVariables(obj: any): any {
    if (typeof obj === 'string') {
      return this.replaceStringVariables(obj);
    } else if (Array.isArray(obj)) {
      return obj.map(item => this.replaceVariables(item));
    } else if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.replaceVariables(value);
      }
      return result;
    }
    return obj;
  }

  private replaceStringVariables(str: string): string {
    return str.replace(/\$\{config:([a-zA-Z0-9_.]+)\}/g, (match, path) => {
      try {
        return this.configLoader.get<string>(path);
      } catch (error) {
        throw new Error(`Config variable not found: ${path}`);
      }
    });
  }
}
