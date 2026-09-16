export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { sendEmail } from '@/lib/email';
import { extractBearer, getClientIp } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { buildDelivered } from '@/lib/email/orderStatusEmails';
import type { Order, User } from '@/types';

/**
 * POST /api/orders/[orderId]/confirm-received
 *
 * Deixa o PRÓPRIO CLIENTE confirmar que recebeu o pedido, sem depender do
 * vendedor marcar manualmente nem de um webhook da transportadora (Correios
 * e Melhor Envio não avisam status pra gente automaticamente — só a Uber
 * Direct faz isso, e mesmo assim é bom ter esse botão como reforço).
 *
 * Só o próprio cliente (order.userId === uid), só quando status === 'shipped'
 * (já foi despachado, ainda não foi marcado como entregue por ninguém), e
 * nunca pra retirada na loja (o vendedor confirma no balcão, o cliente não
 * está "recebendo" remotamente).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;

  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }

  const ip = getClientIp(req);
  const key = `confirm-received:${uid}`;
  if (!await rateLimit(key, 10, 60_000) || !await rateLimit(`confirm-received-ip:${ip}`, 20, 60_000)) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Aguarde um pouco.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimitRetryAfter(key) / 1000)) } }
    );
  }

  const ref  = adminDb.collection('orders').doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });

  const order = { id: snap.id, ...snap.data() } as Order;

  if (order.userId !== uid) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }
  if (order.status !== 'shipped') {
    return NextResponse.json(
      { error: order.status === 'delivered' ? 'Este pedido já está marcado como entregue.' : 'Este pedido ainda não foi despachado.' },
      { status: 400 }
    );
  }
  if (order.delivery?.carrier === 'pickup') {
    return NextResponse.json({ error: 'Pedidos de retirada na loja são confirmados pelo vendedor no balcão.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  await ref.update({
    status: 'delivered',
    updatedAt: FieldValue.serverTimestamp(),
    'delivery.deliveredAt': FieldValue.serverTimestamp(),
    timeline: FieldValue.arrayUnion({ status: 'delivered', at: now, note: 'Confirmado pelo cliente' }),
  });

  // Notifica o vendedor (best-effort, nunca deve afetar a resposta pro cliente)
  try {
    await adminDb.collection('notifications').doc('seller').collection('items').add({
      type: 'new_order',
      orderId,
      message: `Cliente confirmou recebimento: #${orderId.slice(-8).toUpperCase()}`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn('[confirm-received] falha ao notificar vendedor (best-effort):', err);
  }

  // E-mail de confirmação, mesmo template do fluxo automático de status
  // (update-status/route.ts) — best-effort, falha de email não desfaz a
  // confirmação.
  try {
    const uSnap = await adminDb.collection('users').doc(order.userId).get();
    const userData = uSnap.data() as User | undefined;
    const customerEmail = userData?.email;
    const firstName = (userData?.name ?? '').split(' ')[0] || 'cliente';
    if (customerEmail) {
      const payload = buildDelivered({ ...order, status: 'delivered' }, firstName);
      await sendEmail({
        to: customerEmail,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        from: 'noreply',
        replyTo: 'contato@mikma.com.br',
      });
    }
  } catch (err) {
    console.error('[confirm-received] falha ao enviar email:', err);
  }

  return NextResponse.json({ ok: true });
}
