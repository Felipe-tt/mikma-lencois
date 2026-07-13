import { z } from 'zod';

export const updateStatusSchema = z.object({
  trackingCode: z.string().trim().min(1).max(60).optional(),
});
