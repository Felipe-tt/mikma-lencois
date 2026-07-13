import { z } from 'zod';

export const resendEventSchema = z.object({
  type: z.string().min(1),
  created_at: z.string(),
  data: z.object({
    email_id: z.string().min(1),
    from: z.string().min(1),
    to: z.array(z.string()),
    subject: z.string().optional(),
  }),
});
