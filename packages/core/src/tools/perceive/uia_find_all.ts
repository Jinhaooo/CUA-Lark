import { z } from 'zod';
import type { Tool } from '../types.js';
import type { UiaRole, UiaElement } from '@cua-lark/uia-bridge';

const UiaRoleEnum = z.enum(['Button', 'Edit', 'TabItem', 'List', 'ListItem', 'Document', 'Text', 'Pane', 'Window']);

export const uiaFindAllTool: Tool<
  { role: UiaRole; name?: string | RegExp },
  UiaElement[]
> = {
  name: 'uia_find_all',
  description: 'Find all UI elements matching the criteria using UI Automation (UIA). Returns an array of element info with bounding boxes.',
  argsSchema: z.object({
    role: UiaRoleEnum,
    name: z.union([z.string(), z.instanceof(RegExp)]).optional(),
  }),
  async execute(ctx, args) {
    if (!ctx.uia) {
      return {
        success: false,
        observation: 'UIA client not available',
        error: { kind: 'uia_unavailable', message: 'UIA client not initialized' },
      };
    }

    try {
      const results = await ctx.uia.findAll(args);
      const descriptions = results.map((el) => {
        const box = el.boundingRectangle;
        return `${el.role} '${el.name}' at (${box.x},${box.y},${box.width},${box.height})`;
      });

      return {
        success: true,
        data: results,
        observation: `Found ${results.length} elements: [${descriptions.join(', ')}]`,
      };
    } catch (error) {
      return {
        success: false,
        observation: `UIA findAll failed: ${error}`,
        error: { kind: 'locator_failed', message: String(error) },
      };
    }
  },
  category: 'perceive',
  costHint: 'cheap',
};