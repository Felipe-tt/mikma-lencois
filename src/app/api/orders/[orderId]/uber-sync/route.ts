export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { syncUberDelivery } from '@/lib/uberDeliverySync';

/**
 * POST /api/orders/[orderId]/uber-sync
 *
 * A página do pedido (cliente e painel) chama a cada ~10s enquanto a corrida
 * da Uber está em andamento: consulta a corrida e atualiza entregador,
 * posição e status, sem depender só dos webhooks. Dono do pedido ou equipe.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;

  let uid: string;
  let staff = false;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token);
    uid = decoded.uid;
    const role = (decoded as { role?: string }).role ?? '';
    // Equipe confere se o acesso não foi revogado (removido da equipe há
    // pouco ainda tem token válido por até 1h). Comprador não precisa: só
    // vê o próprio pedido, e assim o polling não paga a consulta extra.
    staff = (role === 'seller' || role === 'admin')
      && await adminAuth.verifyIdToken(bearer.token, true).then(() => true, () => false);
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }

  const snap = await adminDb.collection('orders').doc(orderId).get();
  if (!snap.exists) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
  if (!staff && snap.data()!.userId !== uid) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  // Por pedido, não por pessoa: cliente e painel abertos juntos dividem a
  // mesma cota e a Uber recebe no máximo uma consulta a cada 8s.
  if (!await rateLimit(`uber-sync:${orderId}`, 1, 8_000)) {
    return NextResponse.json({ status: 'skipped' });
  }

  try {
    const status = await syncUberDelivery(orderId);
    return NextResponse.json({ status });
  } catch (err) {
    console.error('[uber-sync]', err);
    return NextResponse.json({ status: 'error' }, { status: 502 });
  }
}
