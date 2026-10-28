import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { syncOrderPayment } from '@/lib/orders/syncPayment';

/**
 * POST /api/orders/[orderId]/check-payment
 *
 * A página do pedido chama enquanto o PIX está na tela (e no botão "Já
 * paguei"): consulta a AbacatePay e confirma ou expira o pedido na hora,
 * sem depender só do webhook. Dono do pedido ou equipe.
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

  // Polling a cada ~6s por alguns minutos cabe com folga.
  if (!await rateLimit(`check-payment:${uid}`, 30, 60_000)) {
    return NextResponse.json({ status: 'pending' });
  }

  const snap = await adminDb.collection('orders').doc(orderId).get();
  if (!snap.exists) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
  if (!staff && snap.data()!.userId !== uid) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  try {
    const result = await syncOrderPayment(orderId);
    return NextResponse.json({ status: result });
  } catch (err) {
    console.error('[check-payment]', err);
    return NextResponse.json({ status: 'error' }, { status: 502 });
  }
}
