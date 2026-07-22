import { z } from 'zod';

export const uberWebhookSchema = z.object({
  event_type: z.string().min(1).max(60).optional(),
  resource_id: z.union([z.string(), z.number()]).optional(),
  data: z.record(z.unknown()).optional(),
}).passthrough();
