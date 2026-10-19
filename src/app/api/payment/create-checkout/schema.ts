import { z } from 'zod';
import { addressSchema } from '@/lib/security';

export const createCheckoutSchema = z.object({
  address: addressSchema,
  installments: z.coerce.number().int().min(1).max(12).default(1),
  shipping: z.object({
    carrier: z.string().trim().min(1).max(60),
  }).passthrough(),
  // Cartão no próprio site: token de uso único gerado pelo abacatepay.js.
  // Sem ele, segue o fluxo antigo (página de pagamento da AbacatePay).
  cardToken: z.string().regex(/^ctok_[A-Za-z0-9_-]{4,200}$/).optional(),
  // Valor que a página usou no AbacatePay.create: a cobrança precisa ser igual.
  expectedTotalCents: z.number().int().min(100).optional(),
  customer: z.object({
    name: z.string().trim().min(2).max(150),
    taxId: z.string().trim().min(11).max(18),
    cellphone: z.string().trim().min(8).max(20),
  }).optional(),
}).refine(v => !v.cardToken || (v.expectedTotalCents !== undefined && v.customer !== undefined), {
  message: 'cardToken exige expectedTotalCents e customer',
});
