export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { z } from 'zod';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp, safeJson, extractBearer, tooManyRequests } from '@/lib/security';
import { serialize } from '@/lib/utils/serialize';
import type { Review } from '@/types';

const schema = z.object({
  orderId: z.string().min(1).max(128),
  productId: z.string().min(1).max(128),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional().default(''),
});

// ── GET /api/reviews?productId=xxx — lista pública de avaliações de um produto ──
export async function GET(req: NextRequest) {
  const productId = req.nextUrl.searchParams.get('productId');
  if (!productId) return NextResponse.json({ error: 'productId obrigatório' }, { status: 400 });

  const snap = await adminDb.collection('reviews')
    .where('productId', '==', productId)
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();

  const reviews = snap.docs.map(d => serialize<Review>({ id: d.id, ...d.data() }));
  return NextResponse.json({ reviews });
}

// ── POST /api/reviews — cria avaliação (só compra entregue, 1x por pedido+produto) ──
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;

  let uid: string;
  let name: string;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    uid = decoded.uid;
    name = (decoded.name as string | undefined) ?? 'Cliente';
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }

  if (!await rateLimit(`reviews:ip:${ip}`, 20, 60 * 60 * 1000) || !await rateLimit(`reviews:uid:${uid}`, 10, 60 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(`reviews:uid:${uid}`));
  }

  const body = await safeJson(req, 4096);
  if (!body.ok) return body.response;

  const parsed = schema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  }
  const { orderId, productId, rating, comment } = parsed.data;

  try {
    // Confere se o usuário de fato comprou o produto e recebeu o pedido.
    const orderSnap = await adminDb.collection('orders').doc(orderId).get();
    if (!orderSnap.exists) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }
    const order = orderSnap.data()!;
    if (order.userId !== uid) {
      return NextResponse.json({ error: 'Este pedido não pertence a você' }, { status: 403 });
    }
    if (order.status !== 'delivered') {
      return NextResponse.json({ error: 'Só é possível avaliar produtos de pedidos já entregues' }, { status: 400 });
    }
    const items: { productId: string }[] = order.items ?? [];
    if (!items.some(it => it.productId === productId)) {
      return NextResponse.json({ error: 'Este produto não faz parte deste pedido' }, { status: 400 });
    }

    // Um review por (pedido, produto) — evita duplicar se o comprador levou
    // mais de uma unidade/variante do mesmo produto no mesmo pedido.
    const existing = await adminDb.collection('reviews')
      .where('orderId', '==', orderId)
      .where('productId', '==', productId)
      .limit(1)
      .get();
    if (!existing.empty) {
      return NextResponse.json({ error: 'Você já avaliou este produto neste pedido' }, { status: 409 });
    }

    // Nome real do comprador (o token pode não ter 'name' preenchido).
    if (name === 'Cliente') {
      const userSnap = await adminDb.collection('users').doc(uid).get();
      name = (userSnap.data()?.name as string | undefined) ?? 'Cliente';
    }

    const now = new Date().toISOString();
    const ref = await adminDb.collection('reviews').add({
      productId,
      orderId,
      userId: uid,
      userName: name,
      rating,
      comment,
      createdAt: now,
    });

    return NextResponse.json({ id: ref.id }, { status: 201 });
  } catch (err) {
    console.error('[reviews] falha ao criar avaliação:', err);
    return NextResponse.json({ error: 'Erro ao salvar avaliação' }, { status: 500 });
  }
}
