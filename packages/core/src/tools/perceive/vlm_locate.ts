import { z } from 'zod';
import type { Tool } from '../types.js';

export const vlmLocateTool: Tool<
  { prompt: string },
  { x: number; y: number; confidence: number } | null
> = {
  name: 'vlm_locate',
  description: 'Use VLM to visually locate a target on screen. Returns the coordinates with confidence score.',
  argsSchema: z.object({
    prompt: z.string(),
  }),
  async execute(ctx, args) {
    try {
      const screenshot = await ctx.operator.screenshot();
      const response = await ctx.model.chatVision({
        messages: [
          {
            role: 'system',
            content: 'You are a visual locator. Given an image and a prompt, find the target and return ONLY the coordinates in JSON format: { "x": number, "y": number, "confidence": number } where x,y are the center point of the target and confidence is 0-1. If not found, return { "x": -1, "y": -1, "confidence": 0 }.',
          },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshot.base64}` } },
              { type: 'text', text: `Find: ${args.prompt}` },
            ],
          },
        ],
        response_format: { type: 'json_object' },
      });

      let result;
      try {
        result = JSON.parse(response.content);
      } catch {
        return {
          success: false,
          observation: 'VLM returned invalid JSON',
          error: { kind: 'tool_call_parse_failed', message: 'Failed to parse VLM response' },
        };
      }

      if (result.x === -1 && result.y === -1) {
        return {
          success: true,
          data: null,
          observation: `Target '${args.prompt}' not found on screen`,
        };
      }

      return {
        success: true,
        data: { x: result.x, y: result.y, confidence: result.confidence },
        observation: `Located target at (${result.x},${result.y}) with confidence ${result.confidence}`,
      };
    } catch (error) {
      return {
        success: false,
        observation: `VLM locate failed: ${error}`,
        error: { kind: 'locator_failed', message: String(error) },
      };
    }
  },
  category: 'perceive',
  costHint: 'expensive',
};