import { z } from 'zod';

export const VerifyStageSchema = z.object({
  name: z.string().min(1),
  spec: z.record(z.unknown()),
  maxDurationMs: z.number().int().positive().optional(),
  passThreshold: z.number().min(0).max(1).optional(),
});

export const StagedVerifySpecSchema = z.object({
  kind: z.literal('staged'),
  stages: z.array(VerifyStageSchema).min(1),
});
