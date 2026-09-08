import { z } from 'zod';

export const dispatchSchema = z.object({
  orderId: z.string().trim().min(1).max(80),
  carrier: z.string().trim().min(1).max(60).optional(),
  // Só true quando o vendedor já viu o aviso de "custo Uber maior que o
  // frete cobrado do cliente" e confirmou explicitamente que quer despachar
  // assim mesmo. Sem isso, o despacho é bloqueado nesse cenário.
  forceOverspend: z.boolean().optional(),
});

export const cancelDeliverySchema = z.object({
  orderId: z.string().trim().min(1).max(80),
  reason: z.string().trim().min(1).max(500),
});
