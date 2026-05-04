import { z } from 'zod';

export const PlanSchema = z.array(
  z.object({
    skill: z.string(),
    params: z.record(z.unknown()),
  }),
).max(10);

export type SkillCall = z.infer<typeof PlanSchema>[number];

export type SkillCallList = z.infer<typeof PlanSchema>;