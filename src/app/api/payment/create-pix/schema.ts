import { z } from 'zod';
import { addressSchema } from '@/lib/security';

export const createPixSchema = z.object({
  address: addressSchema,
  shipping: z.object({
    carrier: z.string().trim().min(1).max(60),
  }).passthrough(),
});
