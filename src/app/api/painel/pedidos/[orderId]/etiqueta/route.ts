import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer, validateBody } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { effectiveRole } from '@/lib/staffMfa';
import { getSettings } from '@/lib/settings';
import { shippingBlockReason } from '@/lib/orders/shippingBlock';
import {
  buildPrePostagem, cancelPrePostagem, createPrePostagem, CorreiosError, labelPdf, prePostagemProblems,
  type PrePostagemInfo, type Remetente,
} from '@/lib/correiosPrepostagem';
import type { StoreSettings } from '@/lib/store-settings';
import type { Order } from '@/types';

/**
 * Etiqueta dos Correios pelo contrato, direto do painel (equipe).
 * POST { coleta }: cria a pré-postagem (código de rastreio) e, com coleta,
 *   pede para os Correios buscarem na loja. Uma por pedido.
 * GET: PDF da etiqueta para imprimir.
 * DELETE: cancela a pré-postagem (antes de postar), para gerar outra.
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

function remetenteFrom(s: StoreSettings): Remetente {
  return {
    nome: s.nfeRazaoSocial || s.storeName,
    cnpj: s.nfeCnpj || s.storeCnpj,
    telefone: s.storePhone,
    email: s.storeEmail,
    endereco: {
      cep: s.storeCep || s.originCep, street: s.storeAddress, number: s.storeNumber, complement: s.storeComplement,
      neighborhood: s.storeNeighborhood, city: s.storeCity, state: s.storeState,
    },
  };
}

const fail = (err: unknown) => {
  if (err instanceof CorreiosError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error('[etiqueta]', err);
  return NextResponse.json({ error: 'Não foi possível falar com os Correios agora. Tente de novo.' }, { status: 502 });
};

async function loadOrder(orderId: string) {
  const ref = adminDb.collection('orders').doc(orderId);
  const snap = await ref.get();
  return { ref, order: snap.exists ? ({ id: snap.id, ...snap.data() } as Order & { delivery: Order['delivery'] & { prePostagem?: PrePostagemInfo } }) : null };
}

const postSchema = z.object({ coleta: z.boolean().default(true) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const who = await staff(req);
  if (who instanceof NextResponse) return who;
  if (!await rateLimit(`etiqueta:${who.uid}`, 20, 60_000)) return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco.' }, { status: 429 });
  const parsed = await validateBody(req, postSchema);
  if (!parsed.ok) return parsed.response;

  const { ref, order } = await loadOrder(orderId);
  if (!order) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
  if (order.delivery?.prePostagem) return NextResponse.json({ prePostagem: order.delivery.prePostagem });
  if (order.status !== 'preparing') {
    return NextResponse.json({ error: 'Gere a etiqueta com o pedido em separação (clique em "Comecei a separar o pedido").' }, { status: 409 });
  }
  const blocked = shippingBlockReason(order);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

  const settings = await getSettings();
  const remetente = remetenteFrom(settings);
  const problems = prePostagemProblems(order, remetente);
  if (problems.length) return NextResponse.json({ error: problems.join(' ') }, { status: 400 });

  // Peso pelo cadastro atual dos produtos (o mesmo usado no frete).
  const ids = [...new Set(order.items.map(i => i.productId))];
  const snaps = await Promise.all(ids.map(id => adminDb.collection('products').doc(id).get()));
  const weight = new Map(snaps.map(s => [s.id, (s.get('weightKg') as number | undefined) ?? settings.defaultItemWeightKg ?? 0.8]));
  const weightKg = order.items.reduce((sum, i) => sum + (weight.get(i.productId) ?? 0.8) * i.quantity, 0);

  // Trava o pedido enquanto fala com os Correios: dois cliques (ou duas
  // pessoas) não geram duas etiquetas. A trava vence em 1 minuto.
  const locked = await adminDb.runTransaction(async tx => {
    const cur = (await tx.get(ref)).data() as Order & { delivery?: { prePostagem?: unknown; prePostagemLock?: number } };
    if (cur.delivery?.prePostagem) return 'existe';
    if ((cur.delivery?.prePostagemLock ?? 0) > Date.now() - 60_000) return 'gerando';
    tx.update(ref, { 'delivery.prePostagemLock': Date.now() });
    return 'ok';
  });
  if (locked === 'existe') return NextResponse.json({ prePostagem: (await loadOrder(orderId)).order?.delivery?.prePostagem });
  if (locked === 'gerando') return NextResponse.json({ error: 'A etiqueta deste pedido já está sendo gerada. Aguarde alguns segundos.' }, { status: 409 });

  try {
    const created = await createPrePostagem(buildPrePostagem(order, remetente, { weightKg, coleta: parsed.data.coleta }));
    const prePostagem: PrePostagemInfo = { ...created, coleta: parsed.data.coleta, createdAt: new Date().toISOString() };
    await ref.update({ 'delivery.prePostagem': prePostagem, 'delivery.prePostagemLock': FieldValue.delete(), updatedAt: new Date().toISOString() });
    return NextResponse.json({ prePostagem });
  } catch (err) {
    await ref.update({ 'delivery.prePostagemLock': FieldValue.delete() }).catch(() => {});
    return fail(err);
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const who = await staff(req);
  if (who instanceof NextResponse) return who;
  if (!await rateLimit(`etiqueta-pdf:${who.uid}`, 30, 60_000)) return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco.' }, { status: 429 });
  const { order } = await loadOrder(orderId);
  const pre = order?.delivery?.prePostagem;
  if (!pre) return NextResponse.json({ error: 'Este pedido ainda não tem etiqueta.' }, { status: 404 });
  try {
    const pdf = await labelPdf(pre.id);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="etiqueta-${pre.codigoObjeto}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const who = await staff(req);
  if (who instanceof NextResponse) return who;
  if (!await rateLimit(`etiqueta:${who.uid}`, 20, 60_000)) return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco.' }, { status: 429 });
  const { ref, order } = await loadOrder(orderId);
  const pre = order?.delivery?.prePostagem;
  if (!order || !pre) return NextResponse.json({ error: 'Este pedido não tem etiqueta.' }, { status: 404 });
  if (order.status === 'shipped' || order.status === 'delivered') {
    return NextResponse.json({ error: 'O pedido já foi despachado: a etiqueta não pode mais ser cancelada aqui.' }, { status: 409 });
  }
  try {
    await cancelPrePostagem(pre.id);
    await ref.update({ 'delivery.prePostagem': FieldValue.delete(), updatedAt: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
