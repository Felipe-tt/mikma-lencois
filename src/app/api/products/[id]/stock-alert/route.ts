export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp, tooManyRequests, validateBody } from '@/lib/security';
import { STOCK_ALERTS, stockAlertId } from '@/lib/stockAlerts';

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(200) });

// "Avise-me quando chegar" num produto esgotado. Público (não exige conta):
// o limite por IP segura abuso, e repetir o pedido não cria duplicado.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ip = getClientIp(req);
  const key = `stock-alert:ip:${ip}`;
  if (!await rateLimit(key, 10, 60 * 60 * 1000)) return tooManyRequests(rateLimitRetryAfter(key));

  const { id } = await params;
  if (!/^[\w-]{1,64}$/.test(id)) return NextResponse.json({ error: 'Produto inválido' }, { status: 400 });

  const body = await validateBody(req, schema);
  if (!body.ok) return NextResponse.json({ error: 'Confira o e-mail.' }, { status: 400 });

  const product = await adminDb.collection('products').doc(id).get();
  if (!product.exists || product.data()!.active === false) {
    return NextResponse.json({ error: 'Produto indisponível' }, { status: 404 });
  }

  await adminDb.collection(STOCK_ALERTS).doc(stockAlertId(id, body.data.email)).set({
    productId: id,
    email: body.data.email,
    createdAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true });
}
