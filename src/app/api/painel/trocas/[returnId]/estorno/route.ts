import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer, validateBody } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { effectiveRole } from '@/lib/staffMfa';
import { readPii } from '@/lib/piiCrypto';
import { getPixTransfer, refundCharge, sendPixTransfer } from '@/lib/abacatepayApi';
import { notifyOrderRefunded } from '@/lib/email/cancelledEmail';
import { notifyInApp } from '@/lib/push/notifyInApp';
import { notifySeller } from '@/lib/push/notifySeller';
import { cobrancaAbacate, valorDaDevolucao, type PedidoParaEstorno } from '@/lib/returns/estorno';
import type { ReturnRequest } from '@/types';

/**
 * Dinheiro de uma devolução (ou da sobra de uma troca por peça mais barata),
 * só depois de a equipe confirmar que as peças chegaram (troca concluída).
 *
 * POST modo "abacatepay": a AbacatePay devolve sozinha.
 *  - Pedido todo devolvido e pago pela AbacatePay: estorno da cobrança.
 *  - Parte do pedido, sobra de troca ou pedido pago por fora: PIX da loja
 *    para a chave CPF do cliente (o estorno da AbacatePay é só do total).
 * POST modo "fora": a equipe já devolveu por conta própria e só registra.
 * GET: confere se o PIX enviado não foi recusado depois pelo banco.
 */
const schema = z.object({ modo: z.enum(['abacatepay', 'fora']) });

type Via = 'abacatepay' | 'pix' | 'fora';
type Estorno = {
  status: 'processando' | 'feito' | 'falhou'; cents: number; via?: Via; at?: string; claimAt?: number; by?: string;
  transferId?: string; receiptUrl?: string; sandbox?: boolean; motivo?: string;
};
type Devolucao = ReturnRequest & { estorno?: Estorno; saldoCents?: number; pixTentativas?: number };

async function staff(req: NextRequest): Promise<{ uid: string; email?: string } | NextResponse> {
  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    const role = effectiveRole(decoded);
    if (role !== 'seller' && role !== 'admin') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }
}

const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const storeRef = () => adminDb.collection('settings').doc('store');

export async function POST(req: NextRequest, { params }: { params: Promise<{ returnId: string }> }) {
  const { returnId } = await params;
  const who = await staff(req);
  if (who instanceof NextResponse) return who;
  const { uid, email } = who;
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
    const trocaComSobra = d.type === 'troca' && (d.saldoCents ?? 0) < 0;
    if (d.type !== 'devolucao' && !trocaComSobra) return { error: 'Esta troca não tem dinheiro a devolver.', status: 400 } as const;
    if (d.status !== 'concluida') return { error: 'Confirme que as peças chegaram (concluir) antes de devolver o dinheiro.', status: 409 } as const;
    if (d.estorno?.status === 'feito') return { error: 'O dinheiro desta devolução já foi devolvido.', status: 409 } as const;
    if (d.estorno?.status === 'processando' && Date.now() - (d.estorno.claimAt ?? 0) < 5 * 60_000) {
      return { error: 'Já existe uma devolução de dinheiro em andamento.', status: 409 } as const;
    }
    const orderRef = adminDb.collection('orders').doc(d.orderId);
    const order = (await tx.get(orderRef)).data() as PedidoParaEstorno & { userId?: string; status?: string } | undefined;
    if (!order) return { error: 'Pedido não encontrado', status: 404 } as const;
    const valor = trocaComSobra ? { cents: -(d.saldoCents ?? 0), inteira: false } : valorDaDevolucao(order, d.items);
    if (modo === 'fora') return { d, order, orderRef, valor, via: 'fora' as Via, cobranca: null, tentativa: 0 } as const;

    const cobranca = cobrancaAbacate(order.payment);
    const estornoTotal = valor.inteira && !trocaComSobra && cobranca.ok && order.payment?.refundStatus !== 'done';
    const tentativa = (d.pixTentativas ?? 0) + (estornoTotal ? 0 : 1);
    tx.update(retRef, {
      estorno: { status: 'processando', cents: valor.cents, claimAt: Date.now() },
      ...(estornoTotal ? {} : { pixTentativas: tentativa }),
    });
    if (estornoTotal) {
      // Marca no pedido: o aviso do webhook não trata como estorno inesperado.
      tx.update(orderRef, { 'payment.refundStatus': 'processing', 'payment.refundForReturn': returnId });
      return { d, order, orderRef, valor, via: 'abacatepay' as Via, cobranca, tentativa } as const;
    }
    return { d, order, orderRef, valor, via: 'pix' as Via, cobranca: null, tentativa } as const;
  });
  if ('error' in claim) return NextResponse.json({ error: claim.error }, { status: claim.status });
  const { d, order, orderRef, valor, via, tentativa } = claim;
  const short = d.orderId.slice(-8).toUpperCase();
  const liberar = async () => {
    await retRef.update({ estorno: FieldValue.delete() });
    if (via === 'abacatepay') await orderRef.update({ 'payment.refundStatus': FieldValue.delete(), 'payment.refundForReturn': FieldValue.delete() });
  };

  let extra: Partial<Estorno> = {};
  if (via === 'abacatepay' && claim.cobranca?.ok) {
    const c = claim.cobranca;
    const result = await refundCharge(c.kind, c.chargeId, `Devolução do pedido #${short}`, c.sandbox);
    if (!result.ok) {
      if (result.status === 0) return NextResponse.json({ error: 'A AbacatePay não respondeu. O estorno pode ter sido feito: confira em alguns minutos antes de tentar de novo.' }, { status: 504 });
      await liberar();
      if (result.status === 401) return NextResponse.json({ error: 'A chave da AbacatePay não tem permissão de estorno. Ative a permissão de reembolso na chave.' }, { status: 502 });
      return NextResponse.json({ error: `A AbacatePay recusou o estorno: ${result.error}` }, { status: 502 });
    }
    extra = { transferId: result.data.id };
  }

  if (via === 'pix') {
    const cpf = readPii(order.userId ? (await adminDb.collection('users').doc(order.userId).get()).data() : undefined).cpf.replace(/\D/g, '');
    if (cpf.length !== 11) {
      await liberar();
      return NextResponse.json({ error: 'O cliente não tem CPF cadastrado para receber o PIX. Devolva por fora e registre.' }, { status: 400 });
    }
    // A taxa do PIX sai do valor enviado: soma a taxa para o cliente receber o valor cheio.
    const taxa = Number((await storeRef().get()).get('abacatePixFeeCents') ?? 0) || 0;
    const sandbox = !!(order.payment as { abacateSandbox?: boolean } | undefined)?.abacateSandbox;
    const result = await sendPixTransfer({
      amount: Math.max(100, valor.cents + taxa),
      externalId: `devolucao-${returnId}-${tentativa}`,
      description: `Devolucao pedido ${short}`,
      cpf,
    }, sandbox);
    if (!result.ok) {
      if (result.status === 0) return NextResponse.json({ error: 'A AbacatePay não respondeu. O PIX pode ter saído: confira em alguns minutos antes de tentar de novo.' }, { status: 504 });
      await liberar();
      if (result.status === 429) return NextResponse.json({ error: 'A AbacatePay envia um PIX a cada 30 segundos. Tente de novo em instantes.' }, { status: 429 });
      return NextResponse.json({ error: `A AbacatePay não enviou o PIX: ${result.error}. Se o CPF do cliente não tiver chave PIX, devolva por fora e registre.` }, { status: 502 });
    }
    if (result.data.status === 'FAILED') {
      await liberar();
      return NextResponse.json({ error: 'O banco recusou o PIX para o CPF do cliente (sem chave PIX?). Devolva por fora e registre.' }, { status: 502 });
    }
    // Aprende a taxa cobrada para as próximas devoluções.
    if (result.data.platformFee !== taxa) await storeRef().set({ abacatePixFeeCents: result.data.platformFee }, { merge: true }).catch(() => {});
    extra = { transferId: result.data.id, ...(result.data.receiptUrl ? { receiptUrl: result.data.receiptUrl } : {}), sandbox };
  }

  const at = new Date().toISOString();
  // O webhook do estorno pode ter fechado o pedido antes (e avisado o cliente).
  const avisar = await adminDb.runTransaction(async tx => {
    const o = (await tx.get(orderRef)).data();
    const jaFeito = (o?.payment as { refundStatus?: string } | undefined)?.refundStatus === 'done';
    tx.update(retRef, { estorno: { status: 'feito', cents: valor.cents, via, at, by: uid, ...extra }, refundCents: valor.cents, updatedAt: FieldValue.serverTimestamp() });
    const total = via === 'abacatepay';
    tx.update(orderRef, {
      ...(total ? {
        'payment.refundStatus': 'done',
        ...(jaFeito ? {} : { 'payment.refundedAt': FieldValue.serverTimestamp(), 'payment.refundedBy': uid }),
        ...(extra.transferId ? { 'payment.refundId': extra.transferId } : {}),
      } : { 'payment.partialRefundCents': FieldValue.increment(valor.cents) }),
      updatedAt: FieldValue.serverTimestamp(),
      timeline: FieldValue.arrayUnion({
        status: o?.status ?? 'delivered', at,
        note: via === 'abacatepay' ? `Devolução: ${brl(valor.cents)} estornados pela AbacatePay por ${email ?? uid}`
          : via === 'pix' ? `Devolução: ${brl(valor.cents)} enviados por PIX ao CPF do cliente pela AbacatePay (${email ?? uid})`
          : `Devolução: ${brl(valor.cents)} devolvidos por fora, registrado por ${email ?? uid}`,
      }),
    });
    return !(total && jaFeito);
  });
  if (avisar) await notifyOrderRefunded(d.orderId, { ...order, totalCents: valor.cents }, via !== 'fora');
  // A equipe vê no sino e no celular quanto voltou para o cliente.
  const como = via === 'abacatepay' ? 'estorno pela AbacatePay' : via === 'pix' ? 'PIX no CPF do cliente' : 'registrado como devolvido por fora';
  const msg = `${brl(valor.cents)} devolvidos ao cliente do pedido #${short} (${como})`;
  await notifyInApp({ type: 'refund_done', message: msg, orderId: d.orderId, url: `/painel/pedidos/${d.orderId}` }).catch(() => {});
  await notifySeller({ title: `${brl(valor.cents)} devolvidos`, body: `Pedido #${short} · ${como}`, url: `/painel/pedidos/${d.orderId}`, data: { orderId: d.orderId, event: 'refund_done' } });
  return NextResponse.json({ ok: true, cents: valor.cents, via });
}

/** O PIX "COMPLETE" na criação pode virar "FAILED" depois: confere e avisa no painel. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ returnId: string }> }) {
  const { returnId } = await params;
  const who = await staff(req);
  if (who instanceof NextResponse) return who;
  const ref = adminDb.collection('returns').doc(returnId);
  const snap = await ref.get();
  const e = snap.get('estorno') as Estorno | undefined;
  if (!e || e.via !== 'pix' || e.status !== 'feito' || !e.transferId) return NextResponse.json({ estorno: e ?? null });
  const r = await getPixTransfer(e.transferId, !!e.sandbox);
  if (r.ok && r.data.status === 'FAILED') {
    const falhou: Estorno = { ...e, status: 'falhou', motivo: 'O banco recusou o PIX para o CPF do cliente. Devolva por fora e registre.' };
    await ref.update({ estorno: falhou, refundCents: FieldValue.delete() });
    await adminDb.collection('orders').doc(String(snap.get('orderId'))).update({
      'payment.partialRefundCents': FieldValue.increment(-e.cents),
      timeline: FieldValue.arrayUnion({ status: 'delivered', at: new Date().toISOString(), note: `PIX da devolução (${brl(e.cents)}) recusado pelo banco do cliente` }),
    }).catch(() => {});
    return NextResponse.json({ estorno: falhou });
  }
  return NextResponse.json({ estorno: e });
}
