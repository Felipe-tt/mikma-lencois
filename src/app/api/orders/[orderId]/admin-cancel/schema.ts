import { z } from 'zod';

export const adminCancelSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
