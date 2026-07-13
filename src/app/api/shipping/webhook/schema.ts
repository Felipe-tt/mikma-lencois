import { z } from 'zod';

export const mePayloadSchema = z.object({
  event: z.string().min(1).max(60),
  data: z.object({
    id: z.union([z.string(), z.number()]).transform(String),
    protocol: z.string().optional(),
    status: z.string().optional(),
    tracking: z.string().nullable().optional(),
    tracking_url: z.string().nullable().optional(),
  }),
});
