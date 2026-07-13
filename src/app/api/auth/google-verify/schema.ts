import { z } from 'zod';

export const googleVerifySchema = z.object({
  idToken: z.string().min(1).max(8192),
});
