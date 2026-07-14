export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyAuth, tooManyRequests, safeJson } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { CatalogDraftPatchSchema } from '@/lib/catalogDraft';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAuth(req, { roles: ['seller', 'admin'] });
  if (!auth.ok) return auth.response;

  const key = `catalog-drafts:edit:${auth.decoded.uid}`;
  if (!rateLimit(key, 300, 60 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(key));
  }

  const { id } = await params;
  const ref = adminDb.collection('catalogDrafts').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Rascunho não encontrado' }, { status: 404 });
  if (snap.data()?.status === 'published') {
    return NextResponse.json({ error: 'Este rascunho já foi publicado' }, { status: 409 });
  }

  const body = await safeJson(req, 65536);
  if (!body.ok) return body.response;

  const parsed = CatalogDraftPatchSchema.safeParse(body.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await ref.update({ ...parsed.data, updatedAt: FieldValue.serverTimestamp() });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAuth(req, { roles: ['seller', 'admin'] });
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const ref = adminDb.collection('catalogDrafts').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Rascunho não encontrado' }, { status: 404 });

  // Apaga também as imagens já enviadas pro Storage — senão viram lixo órfão.
  const images = (snap.data()?.images ?? []) as Array<{ path?: string }>;
  await Promise.all(
    images.map(async (img) => {
      if (!img.path) return;
      try {
        await adminStorage.bucket().file(img.path).delete({ ignoreNotFound: true });
      } catch {
        // não bloqueia a exclusão do rascunho por falha ao apagar uma imagem
      }
    })
  );

  await ref.delete();
  return NextResponse.json({ ok: true });
}
