import { z } from 'zod';

export const webhookSchema = z.object({
  event: z.string().min(1).max(60),
  data: z.object({
    transparent: z.record(z.string(), z.unknown()).optional(),
    checkout: z.record(z.string(), z.unknown()).optional(),
    customer: z.record(z.string(), z.unknown()).optional(),
  }),
}).refine(
  (v) => !v.event.startsWith('transparent.') || v.data.transparent !== undefined,
  { message: 'data.transparent ausente para evento transparent.*' }
);
