import { z } from 'zod';

export const shippingEstimateSchema = z.object({
  destCep: z.string().trim().regex(/^\d{5}-?\d{3}$/, 'CEP inválido'),
  qty: z.coerce.number().int().min(1).max(99).default(1),
});
