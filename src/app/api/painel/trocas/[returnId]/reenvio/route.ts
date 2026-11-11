import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { effectiveRole } from '@/lib/staffMfa';
import { expandStockLines } from '@/lib/orderStockLines';
import { confirmOrderPaid } from '@/lib/orders/confirmPayment';
import type { FreteReenvio } from '@/lib/returns/reenvio';
import type { Order, OrderItem, ReturnRequest } from '@/types';

/**
 * Pedido da peça nova de uma troca (equipe).
 * POST (ao aprovar): cria o pedido com a peça nova e reserva o estoque.
 *   Saldo a pagar: o pedido fica aguardando o PIX do cliente (diferença de
 *   preço e frete). Sem nada a pagar: já entra como pago. Em qualquer caso
 *   o envio fica travado até as peças antigas chegarem.
 * PATCH (ao concluir): libera o envio da peça nova.
 */
async function staff(req: NextRequest): Promise<{ uid: string } | NextResponse> {
  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    const role = effectiveRole(decoded);
    if (role !== 'seller' && role !== 'admin') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    return { uid: decoded.uid };
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }
}

type Troca = ReturnRequest & {
  defeito?: boolean;
  novos?: (OrderItem & { no: string })[];
  freteNovo?: FreteReenvio;
  freteCents?: number;
  saldoCents?: number;
  reenvioOrderId?: string;
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ returnId: string }> }) {
  const { returnId } = await params;
  const who = await staff(req);
  if (who instanceof NextResponse) return who;
  if (!await rateLimit(`troca-reenvio:${who.uid}`, 20, 60_000)) return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco.' }, { status: 429 });

  const retRef = adminDb.collection('returns').doc(returnId);
  const orderId = `ord_${randomBytes(8).toString('hex')}`;
  const orderRef = adminDb.collection('orders').doc(orderId);
  const now = new Date().toISOString();

  // Uma transação só: confere a troca, reserva o estoque e cria o pedido.
  const r = await adminDb.runTransaction(async tx => {
    const snap = await tx.get(retRef);
    if (!snap.exists) return { error: 'Troca não encontrada', status: 404 } as const;
    const t = { id: snap.id, ...snap.data() } as Troca;
    if (t.reenvioOrderId) return { existe: t.reenvioOrderId } as const;
    if (t.type !== 'troca' || !t.novos?.length || !t.freteNovo) return { error: 'Esta troca não tem peça nova escolhida.', status: 400 } as const;
    if (t.status !== 'aprovada') return { error: 'Aprove a troca antes.', status: 409 } as const;
    const original = (await tx.get(adminDb.collection('orders').doc(t.orderId))).data() as Order | undefined;
    if (!original) return { error: 'Pedido original não encontrado', status: 404 } as const;

    const items: OrderItem[] = t.novos.map(({ no: _no, ...it }) => it);
    const lines = expandStockLines(items);
    const invRefs = lines.map(l => adminDb.collection('inventory').doc(l.sku));
    const invSnaps = invRefs.length ? await tx.getAll(...invRefs) : [];
    for (let i = 0; i < lines.length; i++) {
      const inv = invSnaps[i].data();
      if (inv && ((inv.quantity ?? 0) - (inv.reserved ?? 0)) < lines[i].quantity) {
        return { error: `Sem estoque da peça nova (${items.find(it => it.sku === lines[i].sku)?.productName ?? lines[i].sku}). Combine outra peça com o cliente.`, status: 409 } as const;
      }
    }
    lines.forEach((l, i) => {
      if (invSnaps[i].exists) tx.update(invRefs[i], { reserved: FieldValue.increment(l.quantity), updatedAt: FieldValue.serverTimestamp() });
    });

    const productsCents = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const freteCents = t.freteCents ?? 0;
    const saldo = t.saldoCents ?? 0;
    const totalCents = Math.max(0, saldo);
    const f = t.freteNovo;
    const short = t.orderId.slice(-8).toUpperCase();
    tx.set(orderRef, {
      userId: original.userId,
      customerName: original.customerName ?? '',
      customerEmail: original.customerEmail ?? '',
      items,
      address: original.address,
      status: 'pending_payment',
      productsCents,
      shippingCents: freteCents,
      // As peças devolvidas pagam a peça nova: entram como desconto.
      discountCents: productsCents + freteCents - totalCents,
      totalCents,
      payment: { method: 'pix', abacateSandbox: !!(original.payment as { abacateSandbox?: boolean } | undefined)?.abacateSandbox },
      delivery: { carrier: f.carrier, label: f.label, priceCents: freteCents, realPriceCents: f.realPriceCents, estimatedDays: f.estimatedDays, uberSandbox: f.uberSandbox },
      selectedShipping: { carrier: f.carrier, label: f.label, priceCents: freteCents, estimatedDays: f.estimatedDays },
      troca: { returnId, origemOrderId: t.orderId, aguardandoPecas: true },
      timeline: [{ status: 'created', at: now, note: `Peça nova da troca do pedido #${short}` }],
      createdAt: now,
      updatedAt: now,
    });
    tx.update(retRef, { reenvioOrderId: orderId, updatedAt: FieldValue.serverTimestamp() });
    return { criado: orderId, saldo, short } as const;
  });

  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
  if ('existe' in r) return NextResponse.json({ orderId: r.existe });

  // Nada a pagar: o pedido já entra como pago (debita o estoque reservado).
  if (r.saldo <= 0) {
    await confirmOrderPaid(r.criado, `troca-${returnId}`, `Troca do pedido #${r.short}: nada a pagar`, { uid: who.uid, note: 'Troca sem valor a pagar' });
  }
  return NextResponse.json({ orderId: r.criado, aPagarCents: Math.max(0, r.saldo) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ returnId: string }> }) {
  const { returnId } = await params;
  const who = await staff(req);
  if (who instanceof NextResponse) return who;
  const t = (await adminDb.collection('returns').doc(returnId).get()).data() as Troca | undefined;
  if (!t?.reenvioOrderId) return NextResponse.json({ ok: true, nada: true });
  if (t.status !== 'concluida') return NextResponse.json({ error: 'Conclua a troca (peças conferidas) antes de liberar o envio.' }, { status: 409 });
  const ref = adminDb.collection('orders').doc(t.reenvioOrderId);
  await ref.update({
    'troca.aguardandoPecas': false,
    updatedAt: FieldValue.serverTimestamp(),
    timeline: FieldValue.arrayUnion({ status: 'paid', at: new Date().toISOString(), note: 'Peças da troca conferidas: liberado para envio' }),
  });
  return NextResponse.json({ ok: true, orderId: t.reenvioOrderId });
}
