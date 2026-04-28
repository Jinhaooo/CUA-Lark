import { readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import { z } from 'zod';

const configSchema = z.object({
  im: z.object({
    test_group: z.object({
      name_pattern: z.string(),
      expected_member_count: z.number().int().positive()
    })
  })
});

export type Config = z.infer<typeof configSchema>;

export class ConfigLoader {
  private configPath: string;

  constructor(configPath: string = './configs/test-targets.yaml') {
    this.configPath = configPath;
  }

  load(): Config {
    try {
      const content = readFileSync(this.configPath, 'utf8');
      const config = yaml.load(content) as unknown;
      const parsedConfig = configSchema.parse(config);
      return parsedConfig;
    } catch (error) {
      throw new Error(`Failed to load config: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  get<T>(path: string): T {
    const config = this.load();
    return this.getByPath(config, path) as T;
  }

  private getByPath(obj: any, path: string): any {
    const parts = path.split('.');
    let result = obj;
    
    for (const part of parts) {
      if (result === undefined || result === null) {
        throw new Error(`Config path not found: ${path}`);
      }
      result = result[part];
    }
    
    return result;
  }
}