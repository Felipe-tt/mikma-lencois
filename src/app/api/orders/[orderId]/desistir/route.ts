import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer, tooManyRequests } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { notifyWithdrawalReceived } from '@/lib/email/cancelledEmail';
import { notifySeller } from '@/lib/push/notifySeller';
import { withdrawalBlockReason } from '@/lib/orders/withdrawal';
import { effectiveRole } from '@/lib/staffMfa';

/**
 * POST /api/orders/[orderId]/desistir
 *
 * O cliente desiste, pelo próprio site, de uma compra já paga que ainda não
 * chegou (CDC, art. 49; Decreto 7.962/2013, art. 5º, § 1º: pela mesma
 * ferramenta da compra). Antes só o pedido não pago tinha "Cancelar"; o
 * pago dependia de e-mail ou WhatsApp.
 *
 * Não cancela sozinho: o pedido fica marcado, o envio fica travado, o
 * cliente recebe a confirmação na hora (§ 4º) e a equipe cancela e devolve
 * o dinheiro pelo painel (que sabe estornar, cancelar a corrida da Uber ou
 * a etiqueta dos Correios). Depois de entregue, vale a devolução do pedido.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;

  let uid: string;
  try {
    uid = (await adminAuth.verifyIdToken(bearer.token, true)).uid;
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }
  if (!await rateLimit(`desistir:${uid}`, 10, 60 * 60_000)) return tooManyRequests(rateLimitRetryAfter(`desistir:${uid}`));

  const ref = adminDb.collection('orders').doc(orderId);
  const now = new Date();
  const at = now.toISOString();
  let result: { error: string; status: number } | { order: FirebaseFirestore.DocumentData; already: boolean };
  try {
    result = await adminDb.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const order = snap.data();
      if (!order || order.userId !== uid) return { error: 'Pedido não encontrado', status: 404 };
      const blocked = withdrawalBlockReason(order.status as string);
      if (blocked) return { error: blocked, status: 409 };
      if ((order.cancelRequest as { at?: string } | undefined)?.at) return { order, already: true };
      tx.update(ref, {
        cancelRequest: { at },
        updatedAt: FieldValue.serverTimestamp(),
        timeline: FieldValue.arrayUnion({ status: 'cancel_requested', at, note: 'Cliente pediu para desistir da compra' }),
      });
      return { order, already: false };
    });
  } catch (err) {
    console.error('[desistir] pedido %s:', orderId, err);
    return NextResponse.json({ error: 'Não foi possível registrar agora. Tente de novo.' }, { status: 500 });
  }
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  if (result.already) return NextResponse.json({ ok: true, at: (result.order.cancelRequest as { at: string }).at });

  const { order } = result;
  const short = orderId.slice(-8).toUpperCase();
  // Confirmação ao cliente e aviso à equipe: best-effort, o pedido já ficou marcado.
  await notifyWithdrawalReceived(orderId, order, { at: now, emTransito: order.status === 'shipped' });
  await notifySeller({
    title: 'Cliente quer desistir da compra',
    body: `#${short}: cancele e devolva o dinheiro`,
    url: `/painel/pedidos/${orderId}`,
    data: { orderId, event: 'cancel_requested' },
  });
  try {
    await adminDb.collection('notifications').doc('seller').collection('items').add({
      type: 'cancel_request',
      orderId,
      message: `Cliente pediu para desistir da compra: #${short}`,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn('[desistir] aviso no painel falhou (pedido %s):', orderId, err);
  }
  return NextResponse.json({ ok: true, at });
}

/**
 * DELETE: manter o pedido. O cliente desistiu por engano ou mudou de ideia
 * de novo (ele mesmo, ou a equipe a pedido dele). Antes do cancelamento,
 * tira a marca e o envio volta a ser liberado.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;

  let uid: string;
  let staff: boolean;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    uid = decoded.uid;
    const role = effectiveRole(decoded);
    staff = role === 'seller' || role === 'admin';
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }
  if (!await rateLimit(`desistir:${uid}`, 10, 60 * 60_000)) return tooManyRequests(rateLimitRetryAfter(`desistir:${uid}`));

  const ref = adminDb.collection('orders').doc(orderId);
  const at = new Date().toISOString();
  const result = await adminDb.runTransaction(async tx => {
    const order = (await tx.get(ref)).data();
    if (!order || (order.userId !== uid && !staff)) return { error: 'Pedido não encontrado', status: 404 };
    if (order.status === 'cancelled') return { error: 'O pedido já foi cancelado.', status: 409 };
    if (!(order.cancelRequest as { at?: string } | undefined)?.at) return { ok: true };
    tx.update(ref, {
      cancelRequest: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      timeline: FieldValue.arrayUnion({ status: 'cancel_withdrawn', at, note: order.userId === uid ? 'Cliente quer manter o pedido' : 'Equipe manteve o pedido, a pedido do cliente' }),
    });
    return { ok: true };
  });
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
