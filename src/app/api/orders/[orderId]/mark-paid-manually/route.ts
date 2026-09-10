export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer, getClientIp } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { confirmOrderPaid } from '@/lib/orders/confirmPayment';

const bodySchema = z.object({
  // Como o cliente pagou de fato: obrigatório, fica registrado no pedido e
  // no timeline pra auditoria (ex: "Dinheiro na retirada", "Transferência
  // direto pro Felipe", "Pago fiado, combinado por WhatsApp").
  note: z.string().trim().min(3).max(300),
});

/**
 * POST /api/orders/[orderId]/mark-paid-manually
 *
 * Confirma manualmente que um pedido foi pago por fora da AbacatePay:
 * dinheiro na entrega/retirada, transferência direta, outra plataforma,
 * combinado por WhatsApp, etc. Só seller/admin, e só em pedidos ainda
 * 'pending_payment' — nunca sobrescreve um pedido que já foi confirmado
 * (nem por webhook real, nem por outra confirmação manual).
 *
 * Passa pelo MESMO caminho de código do webhook real (confirmOrderPaid):
 * debita estoque, libera reserva, limpa carrinho, notifica vendedor e
 * envia o e-mail de confirmação pro cliente — a única diferença é a
 * origem da confirmação, registrada em payment.confirmedManuallyBy /
 * confirmedManuallyNote para não se confundir nunca com um pagamento
 * real passado pela AbacatePay.
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
  const key = `mark-paid-manually:${uid}`;
  if (!await rateLimit(key, 20, 60_000) || !await rateLimit(`mark-paid-manually-ip:${ip}`, 40, 60_000)) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Aguarde um pouco.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimitRetryAfter(key) / 1000)) } }
    );
  }

  const parsedBody = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: 'Descreva como o pagamento foi feito (mínimo 3 caracteres).' },
      { status: 400 }
    );
  }
  const { note } = parsedBody.data;

  const snap = await adminDb.collection('orders').doc(orderId).get();
  if (!snap.exists) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
  const order = snap.data()!;

  if (order.status !== 'pending_payment') {
    return NextResponse.json({ error: 'Pedido não está mais aguardando pagamento.' }, { status: 400 });
  }

  const confirmed = await confirmOrderPaid(
    orderId,
    `manual:${uid}:${Date.now()}`,
    `Pago manualmente por fora · ${note}`,
    { uid, note }
  );

  if (!confirmed) {
    return NextResponse.json(
      { error: 'Não foi possível confirmar, o pedido pode já ter sido pago ou cancelado. Atualize a página.' },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true });
}
