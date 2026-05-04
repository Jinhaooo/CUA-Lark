import { readFile } from 'fs/promises';
import { parse } from 'yaml';
import type { HarnessConfig } from '../tools/types.js';

const DEFAULT_CONFIG: HarnessConfig = {
  maxLoopIterations: 30,
  maxTokensPerSkill: 120000,
  messageHistoryLimit: 5,
  loopDetectionThreshold: 3,
};

export class HarnessConfigLoader {
  static async load(path: string): Promise<HarnessConfig> {
    try {
      const content = await readFile(path, 'utf-8');
      const config = parse(content) as Partial<HarnessConfig>;
      return { ...DEFAULT_CONFIG, ...config };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return DEFAULT_CONFIG;
      }
      throw error;
    }
  }
}