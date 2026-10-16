import { z } from 'zod';

export const updateStatusSchema = z.object({
  trackingCode: z.string().trim().min(1).max(60).optional(),
  // Status que a tela estava vendo. Se o pedido já saiu dele (toque duplo,
  // dois aparelhos), a rota recusa em vez de avançar duas etapas.
  fromStatus: z.string().max(40).optional(),
});
