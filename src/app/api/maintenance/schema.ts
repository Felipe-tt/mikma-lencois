import { z } from 'zod';

export const maintenanceActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('toggle') }),
  z.object({ action: z.literal('release'), ip: z.string().min(1).max(45) }),
  z.object({ action: z.literal('release_all') }),
  z.object({ action: z.literal('clear_queue') }),
]);
