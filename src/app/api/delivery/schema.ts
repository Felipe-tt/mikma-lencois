import { z } from 'zod';

export const dispatchSchema = z.object({
  orderId: z.string().trim().min(1).max(80),
  carrier: z.string().trim().min(1).max(60).optional(),
});

export const cancelDeliverySchema = z.object({
  orderId: z.string().trim().min(1).max(80),
  reason: z.string().trim().min(1).max(500),
});
