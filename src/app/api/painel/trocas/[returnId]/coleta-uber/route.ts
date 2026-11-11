import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { effectiveRole } from '@/lib/staffMfa';
import { getSettings } from '@/lib/settings';
import { withPii } from '@/lib/piiCrypto';
import { recordShippingSpent } from '@/lib/shipping-ledger';
import { avisarCliente } from '@/lib/returns/avisarCliente';
import type { ColetaUber } from '@/lib/returns/returnSteps';
import {
  buildUberAddress, formatPhone, uberCancelDelivery, uberCreateDelivery, uberDirectConfigured, uberQuote,
} from '@/lib/uber-direct';
import type { Order, ReturnRequest } from '@/types';

/**
 * Entregador da Uber para buscar as peças de uma troca na casa do cliente
 * e trazer para a loja (pedido que chegou pela Uber). Equipe.
 * POST: chama o entregador (depois de combinar o horário com o cliente).
 * DELETE: cancela, antes de o entregador pegar o pacote.
 * O andamento chega pelo webhook da Uber (uber-webhook), como na entrega.
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

type Coleta = ColetaUber & { sandbox: boolean; feeCents?: number; status?: string };
type Devolucao = ReturnRequest & { devolverPor?: string; coletaUber?: Coleta; coletaLock?: number; coletaTentativas?: number };

const fail = (err: unknown) => {
  console.error('[coleta-uber]', err instanceof Error ? err.message : err);
  return NextResponse.json({ error: 'Não foi possível chamar a Uber agora. Tente de novo em instantes.' }, { status: 502 });
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ returnId: string }> }) {
  const { returnId } = await params;
  const who = await staff(req);
  if (who instanceof NextResponse) return who;
  if (!await rateLimit(`coleta-uber:${who.uid}`, 10, 60_000)) return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco.' }, { status: 429 });

  const ref = adminDb.collection('returns').doc(returnId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Troca não encontrada' }, { status: 404 });
  const devolucao = { id: snap.id, ...snap.data() } as Devolucao;
  if (devolucao.devolverPor !== 'uber') return NextResponse.json({ error: 'Esta troca não volta pela Uber.' }, { status: 409 });
  if (devolucao.coletaUber) return NextResponse.json({ coletaUber: devolucao.coletaUber });
  if (devolucao.status !== 'aprovada') return NextResponse.json({ error: 'Aprove a troca antes de chamar o entregador.' }, { status: 409 });

  const settings = await getSettings();
  const sandbox = !!settings.uberDirectSandboxMode;
  if (!uberDirectConfigured(sandbox)) return NextResponse.json({ error: 'A Uber ainda não está configurada na loja.' }, { status: 503 });

  const order = { id: devolucao.orderId, ...(await adminDb.collection('orders').doc(devolucao.orderId).get()).data() } as Order;
  const addr = order.address;
  if (!addr?.street || !addr?.number) return NextResponse.json({ error: 'O pedido não tem o endereço completo do cliente.' }, { status: 400 });
  if (!settings.storeAddress || !settings.storeNumber) return NextResponse.json({ error: 'Falta o endereço da loja (Configurações > Loja).' }, { status: 400 });
  const user = withPii((await adminDb.collection('users').doc(order.userId).get()).data());
  const phone = (user.phone as string | undefined) || '';
  if (phone.replace(/\D/g, '').length < 10) return NextResponse.json({ error: 'O cliente não tem telefone cadastrado. O entregador precisa dele.' }, { status: 400 });

  // Trava: dois cliques não chamam dois entregadores. Vence em 1 minuto.
  const tentativa = await adminDb.runTransaction(async tx => {
    const cur = (await tx.get(ref)).data() as Devolucao;
    if (cur.coletaUber) return 'existe' as const;
    if ((cur.coletaLock ?? 0) > Date.now() - 60_000) return 'chamando' as const;
    const n = (cur.coletaTentativas ?? 0) + 1;
    tx.update(ref, { coletaLock: Date.now(), coletaTentativas: n });
    return n;
  });
  if (tentativa === 'existe') return NextResponse.json({ coletaUber: (await ref.get()).get('coletaUber') });
  if (tentativa === 'chamando') return NextResponse.json({ error: 'O entregador já está sendo chamado. Aguarde alguns segundos.' }, { status: 409 });

  try {
    const pickupAddress = buildUberAddress({
      street: addr.street, number: addr.number, complement: addr.complement,
      city: addr.city ?? '', state: addr.state ?? '', zipCode: addr.cep ?? '',
    });
    const dropoffAddress = buildUberAddress({
      street: settings.storeAddress, number: settings.storeNumber,
      city: settings.storeCity ?? '', state: settings.storeState ?? '', zipCode: settings.originCep ?? '',
    });
    const quote = await uberQuote(pickupAddress, dropoffAddress, sandbox);
    const short = devolucao.orderId.slice(-8).toUpperCase();
    const created = await uberCreateDelivery({
      // Referência única por tentativa: depois de um cancelamento, a
      // mesma chave devolveria a corrida cancelada.
      orderId: `troca-${returnId}-${tentativa}`,
      quoteId: quote.quoteId,
      pickupName: order.customerName || (user.name as string | undefined) || 'Cliente',
      pickupAddress,
      pickupPhoneNumber: formatPhone(phone),
      pickupNotes: `Buscar pacote de troca do pedido ${short} da ${settings.storeName || 'Mikma Lençóis'}.`,
      dropoffName: settings.storeName || 'Mikma Lençóis',
      dropoffAddress,
      dropoffPhoneNumber: formatPhone(settings.storePhone || ''),
      dropoffNotes: `Troca do pedido ${short}.`,
      manifestItems: devolucao.items.map(i => ({ name: i.productName.slice(0, 80), quantity: i.quantity, size: 'medium' as const })),
    }, sandbox);
    const coletaUber: Coleta = {
      deliveryId: created.deliveryId,
      trackingUrl: created.trackingUrl,
      createdAt: new Date().toISOString(),
      sandbox,
      feeCents: created.feeCents,
      status: created.status,
    };
    await ref.update({ coletaUber, coletaLock: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
    try { await recordShippingSpent(created.feeCents); } catch (err) { console.warn('[coleta-uber] caixa de frete', err); }
    await avisarCliente(returnId, 'coleta');
    return NextResponse.json({ coletaUber });
  } catch (err) {
    await ref.update({ coletaLock: FieldValue.delete() }).catch(() => {});
    return fail(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ returnId: string }> }) {
  const { returnId } = await params;
  const who = await staff(req);
  if (who instanceof NextResponse) return who;
  if (!await rateLimit(`coleta-uber:${who.uid}`, 10, 60_000)) return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco.' }, { status: 429 });
  const ref = adminDb.collection('returns').doc(returnId);
  const coleta = (await ref.get()).get('coletaUber') as Coleta | undefined;
  if (!coleta) return NextResponse.json({ error: 'Nenhum entregador foi chamado para esta troca.' }, { status: 404 });
  if (coleta.coletadoEm) return NextResponse.json({ error: 'O entregador já pegou o pacote.' }, { status: 409 });
  try {
    await uberCancelDelivery(coleta.deliveryId, 'customer_called_to_cancel', 'Troca: coleta cancelada pela loja', coleta.sandbox);
  } catch (err) {
    return fail(err);
  }
  // Novo entregador depois: o cliente precisa receber o aviso de novo.
  await ref.update({ coletaUber: FieldValue.delete(), 'avisos.coleta': FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
  return NextResponse.json({ ok: true });
}
