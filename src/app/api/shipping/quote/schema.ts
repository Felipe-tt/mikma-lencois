import { z } from 'zod';

export const quoteSchema = z.object({
  destCep: z.string().trim().regex(/^\d{5}-?\d{3}$/, 'CEP inválido'),
});
