export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer, getClientIp, validateBody } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { z } from 'zod';
import { adminCancelSchema } from './schema';
import { expandStockLines } from '@/lib/orderStockLines';


// Statuses que ainda não tiveram o estoque debitado (só reservado)
const PENDING_STATUSES = new Set(['pending_payment']);
// Statuses sem reserva nem débito ativo (PIX expirou, reserva já liberada)
const NO_STOCK_STATUSES = new Set(['payment_expired']);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;

  let role: string;
  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    // IMPORTANTE: role vem do custom claim do token, não do documento
    // Firestore /users/{uid}, esse campo pode ser escrito pelo próprio
    // usuário (regra allow update: if isSelf(uid)), então usá-lo aqui
    // permitiria qualquer comprador se autopromover e cancelar pedidos
    // de qualquer cliente.
    role = (decoded as { role?: string }).role ?? '';
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }

  if (role !== 'seller' && role !== 'admin') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const ip = getClientIp(req);
  const key = `admin-cancel:${uid}`;
  if (!await rateLimit(key, 20, 60_000) || !await rateLimit(`admin-cancel-ip:${ip}`, 40, 60_000)) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Aguarde um pouco.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimitRetryAfter(key) / 1000)) } }
    );
  }

  const parsedBody = await validateBody(req, adminCancelSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const reason = (parsedBody.data.reason ?? '').trim() || 'Cancelado pelo lojista';

  const ref = adminDb.collection('orders').doc(orderId);
  const now = new Date().toISOString();

  // Transação: relê o status na hora de escrever. Antes era get() + batch,
  // e um pagamento confirmado pelo webhook no meio fazia o estoque ser
  // tratado como "só reservado" num pedido que já tinha debitado quantity.
  try {
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('NOT_FOUND');
      const order = snap.data()!;
      if (order.status === 'cancelled') throw new Error('ALREADY_CANCELLED');
      if (order.status === 'delivered') throw new Error('DELIVERED');

      // pending_payment: só reservado, libera a reserva.
      // payment_expired: o webhook já liberou a reserva, não mexe no estoque
      //   (antes caía no ramo "pago" e SOMAVA quantity, inflando o estoque).
      // paid/preparing/shipped: quantity já foi debitado, devolve.
      const mode = PENDING_STATUSES.has(order.status)
        ? 'release'
        : NO_STOCK_STATUSES.has(order.status) ? 'none' : 'restock';

      const lines = mode === 'none'
        ? []
        : expandStockLines((order.items ?? []) as Array<{ productId: string; sku: string; quantity: number; swapSku?: string; swapQtyPerUnit?: number }>);
      const invRefs = lines.map(l => adminDb.collection('inventory').doc(l.sku));
      const invSnaps = await Promise.all(invRefs.map(r => tx.get(r)));

      tx.update(ref, {
        status: 'cancelled',
        cancelledAt: now,
        updatedAt: FieldValue.serverTimestamp(),
        timeline: FieldValue.arrayUnion({ status: 'cancelled', at: now, note: reason }),
      });

      for (let i = 0; i < lines.length; i++) {
        if (!invSnaps[i].exists) continue;
        tx.update(invRefs[i], mode === 'release'
          ? { reserved: FieldValue.increment(-lines[i].quantity), updatedAt: FieldValue.serverTimestamp() }
          : { quantity: FieldValue.increment(lines[i].quantity), updatedAt: FieldValue.serverTimestamp() });
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'NOT_FOUND') return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    if (message === 'ALREADY_CANCELLED') return NextResponse.json({ error: 'Pedido já está cancelado' }, { status: 400 });
    if (message === 'DELIVERED') return NextResponse.json({ error: 'Não é possível cancelar pedido já entregue' }, { status: 400 });
    throw err;
  }

  return NextResponse.json({ ok: true });
}
