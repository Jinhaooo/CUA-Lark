import { z } from 'zod';
import type { Tool } from '../types.js';
import { A11yVerifier } from '../../verifier/A11yVerifier.js';

export const verifyA11yTool: Tool<{ role: string; name: string | RegExp }> = {
  name: 'verify_a11y',
  description: 'Verify that a UI element exists using UI Automation (UIA).',
  argsSchema: z.object({
    role: z.string(),
    name: z.union([z.string(), z.instanceof(RegExp)]),
  }),
  async execute(ctx, args) {
    try {
      const verifier = new A11yVerifier();
      const result = await verifier.verify(
        { kind: 'a11y', role: args.role, name: args.name },
        ctx as any
      );

      return {
        success: true,
        data: result,
        observation: result.passed
          ? `A11y verify passed: element found`
          : `A11y verify failed: ${result.reason}`,
      };
    } catch (error) {
      return {
        success: false,
        observation: `A11y verify failed: ${error}`,
        error: { kind: 'verify_failed', message: String(error) },
      };
    }
  },
  category: 'verify',
  costHint: 'cheap',
};