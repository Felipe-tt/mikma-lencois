import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { effectiveRole } from '@/lib/staffMfa';
import { getSettings } from '@/lib/settings';
import { readPii } from '@/lib/piiCrypto';
import { cancelPrePostagem, createPrePostagem, CorreiosError, remetenteFrom } from '@/lib/correiosPrepostagem';
import { buildReversa, reversaProblems, type ReversaInfo } from '@/lib/correiosReversa';
import { avisarCliente } from '@/lib/returns/avisarCliente';
import type { Order, ReturnRequest } from '@/types';

/**
 * Código de devolução dos Correios para uma troca ou devolução (equipe).
 * POST: gera a pré-postagem reversa (o cliente posta de graça em qualquer
 *   agência; os Correios mandam o código por e-mail para ele). Uma por troca.
 * DELETE: cancela o código, antes de o cliente postar.
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

type Devolucao = ReturnRequest & { reversa?: ReversaInfo; reversaLock?: number };

const fail = (err: unknown) => {
  if (err instanceof CorreiosError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error('[reversa]', err);
  return NextResponse.json({ error: 'Não foi possível falar com os Correios agora. Tente de novo.' }, { status: 502 });
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ returnId: string }> }) {
  const { returnId } = await params;
  const who = await staff(req);
  if (who instanceof NextResponse) return who;
  if (!await rateLimit(`reversa:${who.uid}`, 20, 60_000)) return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco.' }, { status: 429 });

  const ref = adminDb.collection('returns').doc(returnId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Troca não encontrada' }, { status: 404 });
  const devolucao = { id: snap.id, ...snap.data() } as Devolucao;
  if (devolucao.reversa) return NextResponse.json({ reversa: devolucao.reversa });
  if (devolucao.status !== 'aprovada') return NextResponse.json({ error: 'Aprove a troca antes de gerar o código de devolução.' }, { status: 409 });

  const orderSnap = await adminDb.collection('orders').doc(devolucao.orderId).get();
  if (!orderSnap.exists) return NextResponse.json({ error: 'Pedido da troca não encontrado' }, { status: 404 });
  const order = { id: orderSnap.id, ...orderSnap.data() } as Order;
  const userData = (await adminDb.collection('users').doc(order.userId).get()).data();
  const pii = readPii(userData);
  const cliente = {
    nome: order.customerName || (userData?.name as string | undefined) || devolucao.customerName || '',
    cpf: pii.cpf,
    telefone: pii.phone,
    email: order.customerEmail || (userData?.email as string | undefined) || '',
    endereco: order.address,
  };
  const settings = await getSettings();
  const loja = remetenteFrom(settings);
  const problems = reversaProblems(cliente, loja);
  if (problems.length) return NextResponse.json({ error: problems.join(' ') }, { status: 400 });

  const ids = [...new Set(devolucao.items.map(i => i.productId))];
  const snaps = await Promise.all(ids.map(id => adminDb.collection('products').doc(id).get()));
  const fallback = settings.defaultItemWeightKg || 0.8;
  const weight = new Map(snaps.map(s => [s.id, (s.get('weightKg') as number | undefined) ?? fallback]));
  const weightKg = devolucao.items.reduce((sum, i) => sum + (weight.get(i.productId) ?? fallback) * i.quantity, 0);

  // Trava: dois cliques não geram dois códigos. Vence em 1 minuto.
  const locked = await adminDb.runTransaction(async tx => {
    const cur = (await tx.get(ref)).data() as Devolucao;
    if (cur.reversa) return 'existe';
    if ((cur.reversaLock ?? 0) > Date.now() - 60_000) return 'gerando';
    tx.update(ref, { reversaLock: Date.now() });
    return 'ok';
  });
  if (locked === 'existe') return NextResponse.json({ reversa: (await ref.get()).get('reversa') });
  if (locked === 'gerando') return NextResponse.json({ error: 'O código já está sendo gerado. Aguarde alguns segundos.' }, { status: 409 });

  try {
    const { body, validade } = buildReversa(devolucao, order, cliente, loja, { weightKg });
    const created = await createPrePostagem(body);
    const reversa: ReversaInfo = { ...created, validade, createdAt: new Date().toISOString() };
    await ref.update({ reversa, reversaLock: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
    // Os Correios também mandam o código, mas sem dizer de qual loja nem
    // até quando; o nosso e-mail explica o passo a passo.
    await avisarCliente(returnId, 'codigo');
    return NextResponse.json({ reversa });
  } catch (err) {
    await ref.update({ reversaLock: FieldValue.delete() }).catch(() => {});
    return fail(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ returnId: string }> }) {
  const { returnId } = await params;
  const who = await staff(req);
  if (who instanceof NextResponse) return who;
  if (!await rateLimit(`reversa:${who.uid}`, 20, 60_000)) return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco.' }, { status: 429 });
  const ref = adminDb.collection('returns').doc(returnId);
  const reversa = (await ref.get()).get('reversa') as ReversaInfo | undefined;
  if (!reversa) return NextResponse.json({ error: 'Esta troca não tem código de devolução.' }, { status: 404 });
  if (reversa.entregueEm) return NextResponse.json({ error: 'O pacote já voltou para a loja.' }, { status: 409 });
  try {
    await cancelPrePostagem(reversa.id);
    // Código novo depois: o cliente precisa receber o e-mail de novo.
    await ref.update({ reversa: FieldValue.delete(), 'avisos.codigo': FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
