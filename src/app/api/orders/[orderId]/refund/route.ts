export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { notifyOrderRefunded } from '@/lib/email/cancelledEmail';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer, validateBody } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { refundCharge } from '@/lib/abacatepayApi';

const bodySchema = z.object({ reason: z.string().trim().max(300).optional() });

/**
 * POST /api/orders/[orderId]/refund
 *
 * Estorna pela AbacatePay (sempre o valor total) um pedido pago e cancelado,
 * ou um pagamento que chegou depois do cancelamento. PIX transparente usa
 * /transparents/refund; cartão (checkout hospedado), /checkouts/refund.
 * Pagamento confirmado "por fora" não passa pela AbacatePay e não tem o que
 * estornar aqui (o painel mantém o "Já devolvi por fora").
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
  if (!await rateLimit(`refund:${uid}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco.' }, { status: 429 });
  }
  const parsed = await validateBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;

  const ref = adminDb.collection('orders').doc(orderId);
  // Trava: marca "processing" na transação para dois cliques (ou duas abas)
  // não mandarem dois estornos.
  const claim = await adminDb.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { error: 'Pedido não encontrado', status: 404 } as const;
    const o = snap.data()!;
    const p = (o.payment ?? {}) as {
      method?: string; txId?: string; checkoutId?: string; paidAt?: unknown; lateCaptureTxId?: string;
      refundStatus?: string; confirmedManuallyBy?: string; abacateSandbox?: boolean; refundClaimAt?: number;
    };
    if (p.refundStatus === 'done') return { error: 'O estorno já foi feito.', status: 409 } as const;
    if (p.refundStatus === 'processing' && Date.now() - (p.refundClaimAt ?? 0) < 5 * 60_000) {
      return { error: 'Já existe um estorno em andamento para este pedido.', status: 409 } as const;
    }
    const late = !!p.lateCaptureTxId && !p.paidAt;
    if (!late && !(o.status === 'cancelled' && p.paidAt)) {
      return { error: 'Só dá para estornar um pedido pago que foi cancelado.', status: 400 } as const;
    }
    if (!late && p.confirmedManuallyBy) {
      return { error: 'Este pedido foi pago por fora da AbacatePay. Devolva pelo mesmo meio e marque como feito.', status: 400 } as const;
    }
    // Cartão no próprio site (card_) e PIX são cobranças transparentes;
    // cartão pela página da AbacatePay é um checkout (bill_).
    const transparentCard = p.method === 'card' && !!p.txId?.startsWith('card_');
    const kind = late
      ? (p.lateCaptureTxId!.startsWith('bill_') ? 'checkout' as const : 'transparent' as const)
      : p.method === 'card' && !transparentCard ? 'checkout' as const : 'transparent' as const;
    const chargeId = late ? p.lateCaptureTxId! : kind === 'transparent' ? p.txId : p.checkoutId;
    if (!chargeId) return { error: 'Cobrança da AbacatePay não encontrada neste pedido.', status: 400 } as const;
    tx.update(ref, { 'payment.refundStatus': 'processing', 'payment.refundClaimAt': Date.now() });
    return { kind, chargeId, sandbox: !!p.abacateSandbox, totalCents: o.totalCents as number };
  });
  if ('error' in claim) return NextResponse.json({ error: claim.error }, { status: claim.status });

  const reason = parsed.data.reason?.trim() || `Pedido #${orderId.slice(-8).toUpperCase()} cancelado`;
  const result = await refundCharge(claim.kind, claim.chargeId, reason, claim.sandbox);

  if (!result.ok) {
    // Timeout/sem resposta: o estorno PODE ter sido feito. Fica "processing"
    // (o webhook transparent.refunded/checkout.refunded fecha) e o vendedor é
    // avisado para conferir antes de tentar de novo.
    if (result.status === 0) {
      return NextResponse.json({ error: 'A AbacatePay não respondeu. O estorno pode ter sido feito: confira em alguns minutos antes de tentar de novo.' }, { status: 504 });
    }
    await ref.update({ 'payment.refundStatus': 'pending', 'payment.refundClaimAt': FieldValue.delete() });
    // 401 "Insufficient permissions": a chave de API não tem a permissão de
    // estorno (cada rota exige a sua, ver Autenticação nas docs).
    if (result.status === 401) {
      return NextResponse.json({ error: 'A chave da AbacatePay não tem permissão de estorno. Ative a permissão de reembolso na chave (painel da AbacatePay) ou estorne por lá e marque como feito.' }, { status: 502 });
    }
    return NextResponse.json({ error: `A AbacatePay recusou o estorno: ${result.error}` }, { status: 502 });
  }

  const brl = (claim.totalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  // Transação: o webhook do estorno pode ter chegado antes e já fechado o
  // pedido (e avisado o cliente). Só quem fecha agora manda o e-mail.
  const closedHere = await adminDb.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const o = snap.data();
    const already = (o?.payment as { refundStatus?: string } | undefined)?.refundStatus === 'done';
    tx.update(ref, {
      'payment.refundStatus': 'done',
      ...(already ? {} : { 'payment.refundedAt': FieldValue.serverTimestamp(), 'payment.refundedBy': uid }),
      'payment.refundId': result.data.id,
      'payment.refundClaimAt': FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      timeline: FieldValue.arrayUnion({
        status: 'cancelled',
        at: new Date().toISOString(),
        note: `Estorno de ${brl} feito pela AbacatePay por ${email ?? uid}`,
      }),
    });
    return already ? null : o ?? null;
  });
  if (closedHere) await notifyOrderRefunded(orderId, closedHere, true);
  return NextResponse.json({ ok: true, refundId: result.data.id });
}
