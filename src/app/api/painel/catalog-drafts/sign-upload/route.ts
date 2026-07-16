export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth, tooManyRequests } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getServiceAccountCredentials } from '@/lib/firebase/admin';
import { generateV4SignedUploadUrl } from '@/lib/gcsSignedUrl';
import crypto from 'node:crypto';

// Só webp — as imagens de rascunho já chegam convertidas pelo navegador
// (ver compressToWebp no client) antes de pedir a URL assinada.
const ALLOWED_TYPES = new Set(['image/webp']);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

const RequestSchema = z.object({
  files: z
    .array(
      z.object({
        contentType: z.string().refine((t) => ALLOWED_TYPES.has(t), 'Só aceitamos webp aqui'),
        sizeBytes: z.number().int().positive().max(MAX_SIZE_BYTES, 'Arquivo muito grande (máx 5MB)'),
      })
    )
    .min(1)
    .max(20),
});

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { roles: ['seller', 'admin'] });
  if (!auth.ok) return auth.response;

  const key = `catalog-drafts:sign-upload:${auth.decoded.uid}`;
  if (!rateLimit(key, 60, 60 * 60 * 1000)) {
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

  const { clientEmail, privateKey, bucket } = getServiceAccountCredentials();
  const now = new Date();
  const folder = `products/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;

  const results = await Promise.all(
    parsed.data.files.map(async () => {
      const token = crypto.randomUUID();
      const destination = `${folder}/draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.webp`;

      const signedUrl = generateV4SignedUploadUrl({
        bucket,
        objectPath: destination,
        clientEmail,
        privateKey,
        contentType: 'image/webp',
        expiresInSeconds: 15 * 60,
        extensionHeaders: {
          'x-goog-meta-firebasestoragedownloadtokens': token,
          'x-goog-meta-cache-control': 'public, max-age=31536000, immutable',
        },
      });

      const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(destination)}?alt=media&token=${token}`;

      return { signedUrl, publicUrl, destination };
    })
  );

  return NextResponse.json({ uploads: results });
}
