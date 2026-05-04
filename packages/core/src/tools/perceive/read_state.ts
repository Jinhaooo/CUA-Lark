import { z } from 'zod';
import type { Tool } from '../types.js';

export const readStateTool: Tool<
  { prompt: string; region?: { x1: number; y1: number; x2: number; y2: number } },
  string
> = {
  name: 'read_state',
  description: 'Use VLM to read and describe the UI state. The prompt should ask a specific question about the current screen state.',
  argsSchema: z.object({
    prompt: z.string(),
    region: z.object({
      x1: z.number(),
      y1: z.number(),
      x2: z.number(),
      y2: z.number(),
    }).optional(),
  }),
  async execute(ctx, args) {
    try {
      const screenshot = await ctx.operator.screenshot();
      const content: any[] = [
        { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshot.base64}` } },
        { type: 'text', text: args.prompt },
      ];

      const response = await ctx.model.chatVision({
        messages: [
          {
            role: 'system',
            content: 'You are a UI state reader. Answer the user\'s question about the screen state concisely in natural language.',
          },
          {
            role: 'user',
            content,
          },
        ],
      });

      return {
        success: true,
        data: response.content,
        observation: response.content,
      };
    } catch (error) {
      return {
        success: false,
        observation: `Read state failed: ${error}`,
        error: { kind: 'locator_failed', message: String(error) },
      };
    }
  },
  category: 'perceive',
  costHint: 'expensive',
};