import { z } from 'zod';
import type { Tool } from '../types.js';

export const hotkeyTool: Tool<{ key: string }> = {
  name: 'hotkey',
  description: 'Press a keyboard shortcut. Supported keys: Enter, Tab, Backspace, Delete, Escape, Ctrl, Shift, Alt, etc.',
  argsSchema: z.object({
    key: z.string(),
  }),
  async execute(ctx, args) {
    try {
      await ctx.operator.execute({
        action_type: 'hotkey',
        action_inputs: {
          key: args.key,
        },
      });
      return {
        success: true,
        observation: `Pressed ${args.key}`,
      };
    } catch (error) {
      return {
        success: false,
        observation: `Hotkey failed: ${error}`,
        error: { kind: 'unknown', message: String(error) },
      };
    }
  },
  category: 'act',
  costHint: 'free',
};