import { z } from 'zod';

/** Peças novas da troca, uma por peça devolvida. */
export const novosSchema = z.array(z.object({
  /** SKU da peça devolvida que esta substitui. */
  no: z.string().min(1).max(120),
  productId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  variantId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  quantity: z.number().int().min(1).max(50),
})).min(1).max(30);
