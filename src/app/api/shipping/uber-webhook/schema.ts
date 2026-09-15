import { z } from 'zod';

export const uberWebhookSchema = z.object({
  // "kind" é o campo real da Uber (ex: "event.delivery_status",
  // "event.courier_update"). event_type mantido só por retrocompatibilidade
  // com payloads antigos/de teste que possam usar esse nome.
  kind: z.string().min(1).max(60).optional(),
  event_type: z.string().min(1).max(60).optional(),
  delivery_id: z.string().optional(),
  resource_id: z.union([z.string(), z.number()]).optional(),
  status: z.string().optional(),
  location: z.object({ lat: z.number().optional(), lng: z.number().optional() }).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
}).passthrough();
