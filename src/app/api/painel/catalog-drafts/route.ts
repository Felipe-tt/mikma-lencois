export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { verifyAuth, tooManyRequests, safeJson } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { CatalogDraftSchema } from '@/lib/catalogDraft';

// Lista todos os rascunhos (qualquer seller/admin pode ver e continuar
// trabalhando neles — não é "por dono", já que a loja é gerida em conjunto).
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { roles: ['seller', 'admin'] });
  if (!auth.ok) return auth.response;

  const snap = await adminDb
    .collection('catalogDrafts')
    .orderBy('createdAt', 'desc')
    .limit(500)
    .get();

  const drafts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ drafts });
}

const ImportBodySchema = z.object({
  items: z.array(CatalogDraftSchema.partial()).min(1).max(300),
});

// Importação em lote a partir de um CSV já parseado no browser — cria um
// rascunho por linha, sem validar campos obrigatórios (a ideia é deixar
// incompleto e ir completando aos poucos, inclusive com imagens depois).
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { roles: ['seller', 'admin'] });
  if (!auth.ok) return auth.response;

  const key = `catalog-drafts:import:${auth.decoded.uid}`;
  if (!rateLimit(key, 10, 60 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(key));
  }

  const body = await safeJson(req, 262144); // 256KB — CSVs grandes de catálogo
  if (!body.ok) return body.response;

  const parsed = ImportBodySchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const batch = adminDb.batch();
  const ids: string[] = [];
  for (const item of parsed.data.items) {
    const ref = adminDb.collection('catalogDrafts').doc();
    ids.push(ref.id);
    batch.set(ref, {
      name: item.name ?? '',
      description: item.description ?? '',
      category: item.category ?? '',
      size: item.size ?? '',
      fabric: item.fabric ?? '',
      colorName: item.colorName ?? '',
      colorHex: item.colorHex ?? '',
      priceBRL: item.priceBRL ?? null,
      weightKg: item.weightKg ?? null,
      pieceCount: item.pieceCount ?? null,
      images: item.images ?? [],
      sourceRaw: item.sourceRaw ?? '',
      status: 'draft',
      createdBy: auth.decoded.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();

  return NextResponse.json({ created: ids.length, ids }, { status: 201 });
}
