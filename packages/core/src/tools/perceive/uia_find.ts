import { z } from 'zod';
import type { Tool } from '../types.js';
import type { UiaRole, UiaElement } from '@cua-lark/uia-bridge';

const UiaRoleEnum = z.enum(['Button', 'Edit', 'TabItem', 'List', 'ListItem', 'Document', 'Text', 'Pane', 'Window']);

export const uiaFindTool: Tool<
  { role: UiaRole; name?: string | RegExp },
  UiaElement | null
> = {
  name: 'uia_find',
  description: 'Find a single UI element using UI Automation (UIA). Returns the element info with bounding box if found, or null if not found.',
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
      const result = await ctx.uia.findElement({
        role: args.role,
        name: args.name ?? '',
        scope: 'descendants',
      });
      if (!result) {
        return {
          success: true,
          data: null,
          observation: `No matching element found for role '${args.role}'`,
        };
      }

      const box = result.boundingRectangle;
      return {
        success: true,
        data: result,
        observation: `Found 1 element: ${result.role} '${result.name}' at (${box.x},${box.y},${box.width},${box.height})`,
      };
    } catch (error) {
      return {
        success: false,
        observation: `UIA find failed: ${error}`,
        error: { kind: 'locator_failed', message: String(error) },
      };
    }
  },
  category: 'perceive',
  costHint: 'cheap',
};