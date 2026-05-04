import { z } from 'zod';
import type { Tool } from '../types.js';
import { VlmVerifier } from '../../verifier/VlmVerifier.js';

export const verifyVlmTool: Tool<{ prompt: string }> = {
  name: 'verify_vlm',
  description: 'Use VLM to verify the current screen state. The prompt should describe what should be visible or true.',
  argsSchema: z.object({
    prompt: z.string(),
  }),
  async execute(ctx, args) {
    try {
      const verifier = new VlmVerifier();
      const result = await verifier.verify(
        { kind: 'vlm', prompt: args.prompt },
        ctx as any
      );

      return {
        success: true,
        data: result,
        observation: result.passed
          ? `VLM verify passed: ${result.reason}`
          : `VLM verify failed: ${result.reason}`,
      };
    } catch (error) {
      return {
        success: false,
        observation: `VLM verify failed: ${error}`,
        error: { kind: 'verify_failed', message: String(error) },
      };
    }
  },
  category: 'verify',
  costHint: 'expensive',
};