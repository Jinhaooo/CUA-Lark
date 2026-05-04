import { z } from 'zod';
import type { Tool } from '../types.js';

export const verifyPixelTool: Tool<{ refImage: string; threshold: number }> = {
  name: 'verify_pixel',
  description: 'Compare current screen with a reference image using pixel-level diff. NOT IMPLEMENTED IN M3.5.',
  argsSchema: z.object({
    refImage: z.string(),
    threshold: z.number(),
  }),
  async execute(_ctx, args) {
    return {
      success: false,
      observation: `verify_pixel not implemented in M3.5. refImage: ${args.refImage}, threshold: ${args.threshold}`,
      error: { kind: 'unknown', message: 'verify_pixel will be implemented in M5' },
    };
  },
  category: 'verify',
  costHint: 'expensive',
};