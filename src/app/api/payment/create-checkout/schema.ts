import { z } from 'zod';
import { addressSchema } from '@/lib/security';

export const createCheckoutSchema = z.object({
  address: addressSchema,
  installments: z.coerce.number().int().min(1).max(12).default(1),
  shipping: z.object({
    carrier: z.string().trim().min(1).max(60),
  }).passthrough(),
});
