export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { notifyOrderRefunded } from '@/lib/email/cancelledEmail';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer, validateBody } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';

const bodySchema = z.object({
  note: z.string().trim().max(300).optional(),
});

/**
 * POST /api/orders/[orderId]/mark-refunded
 *
 * O lojista confirma que devolveu o dinheiro de um pedido pago e cancelado
 * (ou de um pagamento que chegou depois do cancelamento). O estorno em si
 * é feito fora (AbacatePay, banco); aqui só fica o registro pra auditoria
 * e o aviso some do painel.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;

  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;
  let uid: string;
  let email: string | undefined;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    const role = (decoded as { role?: string }).role ?? '';
    if (role !== 'seller' && role !== 'admin') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    uid = decoded.uid;
    email = decoded.email;
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }
  if (!await rateLimit(`mark-refunded:${uid}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco.' }, { status: 429 });
  }

  const parsed = await validateBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const note = parsed.data.note?.trim();

  const ref = adminDb.collection('orders').doc(orderId);
  let refunded: FirebaseFirestore.DocumentData | null = null;
  const result = await adminDb.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return 'NOT_FOUND';
    const order = snap.data()!;
    refunded = order;
    const payment = (order.payment ?? {}) as { paidAt?: unknown; lateCaptureTxId?: string; refundStatus?: string };
    if (payment.refundStatus === 'done') return 'ALREADY';
    const owesRefund = order.status === 'cancelled' && !!payment.paidAt;
    if (!owesRefund && !payment.lateCaptureTxId) return 'NOTHING';
    const at = new Date().toISOString();
    tx.update(ref, {
      'payment.refundStatus': 'done',
      'payment.refundedAt': FieldValue.serverTimestamp(),
      'payment.refundedBy': uid,
      updatedAt: FieldValue.serverTimestamp(),
      timeline: FieldValue.arrayUnion({
        status: order.status,
        at,
        note: `Estorno feito, registrado por ${email ?? uid}${note ? ` · ${note}` : ''}`,
      }),
    });
    return 'OK';
  });

  if (result === 'NOT_FOUND') return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
  if (result === 'ALREADY') return NextResponse.json({ error: 'O estorno já foi registrado.' }, { status: 409 });
  if (result === 'NOTHING') return NextResponse.json({ error: 'Este pedido não tem valor a estornar.' }, { status: 400 });
  // Cliente fica sabendo que o dinheiro voltou (o cancelamento só dizia "será devolvido").
  if (refunded) await notifyOrderRefunded(orderId, refunded, false);
  return NextResponse.json({ ok: true });
}
