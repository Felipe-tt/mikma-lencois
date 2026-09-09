export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer, getClientIp } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';

const ABACATEPAY_BASE = 'https://api.abacatepay.com/v2';

/**
 * POST /api/orders/[orderId]/simulate-payment
 *
 * Só para seller/admin, e só funciona em pedidos PIX criados com
 * settings.abacatePaySandboxMode ativo (payment.abacateSandbox === true).
 * Chama o endpoint oficial de teste da AbacatePay que confirma o PIX como
 * pago SEM nenhum dinheiro real se mover — só funciona com a chave de Dev
 * Mode, a própria AbacatePay rejeita esse endpoint em produção.
 *
 * Esta rota não atualiza o pedido diretamente: só pede à AbacatePay pra
 * marcar o PIX como pago, o webhook real (POST /api/payment/webhook)
 * chega depois e confirma o pedido do jeito normal — o que também serve
 * como teste do próprio webhook, não só do pagamento em si.
 * Ver: https://docs.abacatepay.com/pages/transparents/simulate-payment
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;

  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;

  let role: string;
  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    role = (decoded as { role?: string }).role ?? '';
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }

  if (role !== 'seller' && role !== 'admin') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const ip = getClientIp(req);
  const key = `simulate-payment:${uid}`;
  if (!await rateLimit(key, 20, 60_000) || !await rateLimit(`simulate-payment-ip:${ip}`, 40, 60_000)) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Aguarde um pouco.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimitRetryAfter(key) / 1000)) } }
    );
  }

  const ref  = adminDb.collection('orders').doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
  const order = snap.data()!;

  const payment = order.payment as { method?: string; txId?: string; abacateSandbox?: boolean } | undefined;

  if (payment?.method !== 'pix') {
    return NextResponse.json({ error: 'Simulação só disponível para pagamentos via PIX' }, { status: 400 });
  }
  if (!payment.abacateSandbox) {
    return NextResponse.json(
      { error: 'Este pedido não foi criado em modo de teste (Dev Mode), não pode ser simulado.' },
      { status: 400 }
    );
  }
  if (order.status !== 'pending_payment') {
    return NextResponse.json({ error: 'Pedido não está mais aguardando pagamento.' }, { status: 400 });
  }
  if (!payment.txId) {
    return NextResponse.json({ error: 'Pedido sem PIX gerado.' }, { status: 400 });
  }

  const sandboxKey = process.env.ABACATEPAY_SANDBOX_API_KEY;
  if (!sandboxKey) {
    return NextResponse.json({ error: 'ABACATEPAY_SANDBOX_API_KEY não configurado.' }, { status: 500 });
  }

  const res = await fetch(`${ABACATEPAY_BASE}/transparents/simulate-payment?id=${encodeURIComponent(payment.txId)}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sandboxKey}` },
    body:    JSON.stringify({ metadata: {} }),
    signal:  AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('[simulate-payment] AbacatePay error:', res.status, detail.slice(0, 300));
    return NextResponse.json({ error: 'Erro ao simular pagamento na AbacatePay' }, { status: 502 });
  }

  // Não atualiza o pedido aqui de propósito: o webhook real da AbacatePay
  // chega em seguida e confirma via o mesmo caminho de um pagamento de
  // verdade — é isso que valida o fluxo completo, não só o disparo.
  return NextResponse.json({ ok: true, note: 'Pagamento simulado, aguardando confirmação via webhook (poucos segundos).' });
}
