import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer, validateBody } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { effectiveRole } from '@/lib/staffMfa';
import { refundCharge } from '@/lib/abacatepayApi';
import { notifyOrderRefunded } from '@/lib/email/cancelledEmail';
import { cobrancaAbacate, valorDaDevolucao, type PedidoParaEstorno } from '@/lib/returns/estorno';
import type { ReturnRequest } from '@/types';

/**
 * POST /api/painel/trocas/[returnId]/estorno (equipe): devolve o dinheiro de
 * uma devolução. Só depois de a equipe confirmar que as peças chegaram
 * (devolução concluída no painel).
 *  - modo "abacatepay": estorno do total pela AbacatePay (pedido todo devolvido);
 *  - modo "fora": a equipe já devolveu por PIX (devolução parcial ou pedido
 *    pago por fora) e só registra.
 */
const schema = z.object({ modo: z.enum(['abacatepay', 'fora']) });

type Estorno = { status: 'processando' | 'feito'; cents: number; via?: 'abacatepay' | 'fora'; at?: string; claimAt?: number; by?: string };
type Devolucao = ReturnRequest & { estorno?: Estorno; saldoCents?: number };

export async function POST(req: NextRequest, { params }: { params: Promise<{ returnId: string }> }) {
  const { returnId } = await params;
  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;
  let uid: string; let email: string | undefined;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    const role = effectiveRole(decoded);
    if (role !== 'seller' && role !== 'admin') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    uid = decoded.uid; email = decoded.email;
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }
  if (!await rateLimit(`troca-estorno:${uid}`, 10, 60_000)) return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco.' }, { status: 429 });
  const parsed = await validateBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const { modo } = parsed.data;

  const retRef = adminDb.collection('returns').doc(returnId);
  // Trava na própria devolução: dois cliques não mandam dois estornos.
  const claim = await adminDb.runTransaction(async tx => {
    const snap = await tx.get(retRef);
    if (!snap.exists) return { error: 'Devolução não encontrada', status: 404 } as const;
    const d = { id: snap.id, ...snap.data() } as Devolucao;
    // Troca por peça mais barata: a diferença que sobra volta por PIX.
    const trocaComSobra = d.type === 'troca' && (d.saldoCents ?? 0) < 0;
    if (d.type !== 'devolucao' && !trocaComSobra) return { error: 'Esta troca não tem dinheiro a devolver.', status: 400 } as const;
    if (trocaComSobra && modo !== 'fora') return { error: 'Devolva a diferença da troca por PIX e registre como devolvido.', status: 400 } as const;
    if (d.status !== 'concluida') return { error: 'Confirme que as peças chegaram (concluir a devolução) antes de devolver o dinheiro.', status: 409 } as const;
    if (d.estorno?.status === 'feito') return { error: 'O dinheiro desta devolução já foi devolvido.', status: 409 } as const;
    if (d.estorno?.status === 'processando' && Date.now() - (d.estorno.claimAt ?? 0) < 5 * 60_000) {
      return { error: 'Já existe um estorno em andamento.', status: 409 } as const;
    }
    const orderRef = adminDb.collection('orders').doc(d.orderId);
    const order = (await tx.get(orderRef)).data() as PedidoParaEstorno & { userId?: string } | undefined;
    if (!order) return { error: 'Pedido não encontrado', status: 404 } as const;
    const valor = trocaComSobra ? { cents: -(d.saldoCents ?? 0), inteira: false } : valorDaDevolucao(order, d.items);
    if (modo === 'abacatepay') {
      if (!valor.inteira) return { error: 'A AbacatePay só estorna o pedido inteiro. Devolva o valor das peças por PIX e registre como devolvido.', status: 400 } as const;
      if (order.payment?.refundStatus === 'done') return { error: 'O pagamento deste pedido já foi estornado.', status: 409 } as const;
      const cobranca = cobrancaAbacate(order.payment);
      if (!cobranca.ok) return { error: `${cobranca.motivo} Devolva por PIX e registre como devolvido.`, status: 400 } as const;
      tx.update(retRef, { estorno: { status: 'processando', cents: valor.cents, claimAt: Date.now() } });
      // Marca no pedido: o aviso do webhook não trata como estorno inesperado.
      tx.update(orderRef, { 'payment.refundStatus': 'processing', 'payment.refundForReturn': returnId });
      return { d, order, orderRef, valor, cobranca } as const;
    }
    return { d, order, orderRef, valor, cobranca: null } as const;
  });
  if ('error' in claim) return NextResponse.json({ error: claim.error }, { status: claim.status });
  const { d, order, orderRef, valor } = claim;
  const short = d.orderId.slice(-8).toUpperCase();
  const brl = (valor.cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  let refundId: string | undefined;
  if (claim.cobranca) {
    const c = claim.cobranca;
    const result = await refundCharge(c.kind, c.chargeId, `Devolução do pedido #${short}`, c.sandbox);
    if (!result.ok) {
      if (result.status === 0) {
        return NextResponse.json({ error: 'A AbacatePay não respondeu. O estorno pode ter sido feito: confira em alguns minutos antes de tentar de novo.' }, { status: 504 });
      }
      await retRef.update({ estorno: FieldValue.delete() });
      await orderRef.update({ 'payment.refundStatus': FieldValue.delete(), 'payment.refundForReturn': FieldValue.delete() });
      if (result.status === 401) {
        return NextResponse.json({ error: 'A chave da AbacatePay não tem permissão de estorno. Ative a permissão de reembolso na chave ou devolva por PIX e registre.' }, { status: 502 });
      }
      return NextResponse.json({ error: `A AbacatePay recusou o estorno: ${result.error}` }, { status: 502 });
    }
    refundId = result.data.id;
  }

  const via = claim.cobranca ? 'abacatepay' as const : 'fora' as const;
  const at = new Date().toISOString();
  // O webhook do estorno pode ter fechado o pedido antes (e avisado o cliente).
  const avisar = await adminDb.runTransaction(async tx => {
    const o = (await tx.get(orderRef)).data();
    const jaFeito = (o?.payment as { refundStatus?: string } | undefined)?.refundStatus === 'done';
    tx.update(retRef, { estorno: { status: 'feito', cents: valor.cents, via, at, by: uid }, refundCents: valor.cents, updatedAt: FieldValue.serverTimestamp() });
    tx.update(orderRef, {
      ...(valor.inteira ? {
        'payment.refundStatus': 'done',
        ...(jaFeito ? {} : { 'payment.refundedAt': FieldValue.serverTimestamp(), 'payment.refundedBy': uid }),
        ...(refundId ? { 'payment.refundId': refundId } : {}),
      } : { 'payment.partialRefundCents': FieldValue.increment(valor.cents) }),
      updatedAt: FieldValue.serverTimestamp(),
      timeline: FieldValue.arrayUnion({
        status: o?.status ?? 'delivered', at,
        note: via === 'abacatepay' ? `Devolução: ${brl} estornados pela AbacatePay por ${email ?? uid}` : `Devolução: ${brl} devolvidos por fora, registrado por ${email ?? uid}`,
      }),
    });
    return !(valor.inteira && jaFeito);
  });
  if (avisar) await notifyOrderRefunded(d.orderId, { ...order, totalCents: valor.cents }, via === 'abacatepay');
  return NextResponse.json({ ok: true, cents: valor.cents, via });
}
