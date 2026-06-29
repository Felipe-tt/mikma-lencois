export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth, tooManyRequests } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { adminStorage } from '@/lib/firebase/admin';
import crypto from 'node:crypto';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

const RequestSchema = z.object({
  files: z
    .array(
      z.object({
        contentType: z.string().refine((t) => ALLOWED_TYPES.has(t), 'Tipo não permitido'),
        sizeBytes: z.number().int().positive().max(MAX_SIZE_BYTES, 'Arquivo muito grande (máx 8MB)'),
      })
    )
    .min(1)
    .max(50), // até 50 imagens por lote (25 produtos × 2 imgs média)
});

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { roles: ['seller', 'admin'] });
  if (!auth.ok) return auth.response;

  const key = `sign-upload:${auth.decoded.uid}`;
  if (!rateLimit(key, 30, 60 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(key));
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const bucket = adminStorage.bucket();
  const now = new Date();
  const folder = `products/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;

  const results = await Promise.all(
    parsed.data.files.map(async ({ contentType }) => {
      const ext = contentType === 'image/png' ? '.png' : contentType === 'image/webp' ? '.webp' : contentType === 'image/gif' ? '.gif' : '.jpg';
      const token = crypto.randomUUID();
      const destination = `${folder}/wapp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
      const file = bucket.file(destination);

      // URL assinada válida por 15 minutos — tempo suficiente para o upload
      const [signedUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + 15 * 60 * 1000,
        contentType,
        extensionHeaders: {
          'x-goog-meta-firebasestoragedownloadtokens': token,
          'x-goog-meta-cache-control': 'public, max-age=31536000, immutable',
        },
      });

      // URL pública permanente que o produto vai usar
      const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destination)}?alt=media&token=${token}`;

      return { signedUrl, publicUrl, destination };
    })
  );

  return NextResponse.json({ uploads: results });
}
