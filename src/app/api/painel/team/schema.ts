import { z } from 'zod';

export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  role: z.enum(['seller', 'admin'], { errorMap: () => ({ message: 'Role inválida' }) }),
});

export const removeMemberSchema = z.object({
  uid: z.string().trim().min(1).max(128),
});
