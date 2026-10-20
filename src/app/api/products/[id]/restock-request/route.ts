export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp, tooManyRequests, validateBody } from '@/lib/security';
import { RESTOCK_REQUESTS, restockRequestId } from '@/lib/restockRequests';

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  variantId: z.string().regex(/^[\w-]{1,64}$/),
});

// "Avise-me quando chegar" numa variação esgotada. Público (não exige
// conta). Limite por IP e por e-mail: sem o segundo, dava para inscrever o
// e-mail de outra pessoa em vários produtos.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ip = getClientIp(req);
  const ipKey = `restock:ip:${ip}`;
  if (!await rateLimit(ipKey, 10, 60 * 60 * 1000)) return tooManyRequests(rateLimitRetryAfter(ipKey));

  const { id } = await params;
  if (!/^[\w-]{1,64}$/.test(id)) return NextResponse.json({ error: 'Produto inválido' }, { status: 400 });

  const body = await validateBody(req, schema);
  if (!body.ok) return NextResponse.json({ error: 'Confira o e-mail.' }, { status: 400 });
  const { email, variantId } = body.data;

  const emailKey = `restock:email:${email}`;
  if (!await rateLimit(emailKey, 5, 24 * 60 * 60 * 1000)) return tooManyRequests(rateLimitRetryAfter(emailKey));

  const product = await adminDb.collection('products').doc(id).get();
  const p = product.data();
  if (!p || p.active !== true || !(p.variants as Array<{ id: string }> | undefined)?.some(v => v.id === variantId)) {
    return NextResponse.json({ error: 'Produto indisponível' }, { status: 404 });
  }

  await adminDb.collection(RESTOCK_REQUESTS).doc(restockRequestId(id, variantId, email)).set({
    productId: id,
    variantId,
    email,
    createdAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true });
}
