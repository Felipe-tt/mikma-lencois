export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { extractBearer, getClientIp, tooManyRequests } from '@/lib/security';

const ABACATEPAY_BASE = 'https://api.abacatepay.com/v2';
const ABACATEPAY_KEY  = process.env.ABACATEPAY_API_KEY!;

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const ip = getClientIp(req);
  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }

  // Dual rate limit: por IP e por usuário (mais restrito)
  const ipKey  = `regen-pix:ip:${ip}`;
  const uidKey = `regen-pix:uid:${uid}`;
  if (!rateLimit(ipKey, 20, 60 * 60 * 1000) || !rateLimit(uidKey, 5, 60 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(uidKey));
  }

  const ref   = adminDb.collection('orders').doc(orderId);
  const snap  = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
  const order = snap.data()!;
  if (order.userId !== uid)               return NextResponse.json({ error: 'Acesso negado' },      { status: 403 });
  if (order.status !== 'pending_payment') return NextResponse.json({ error: 'Pedido não está aguardando pagamento' }, { status: 400 });

  // Carrega dados do usuário para customer
  const userSnap = await adminDb.collection('users').doc(uid).get();
  const userData = userSnap.data() ?? {};
  const hasAllCustomerFields = userData.email && userData.cpf && userData.phone && (userData.displayName ?? userData.name);
  const customerData = hasAllCustomerFields ? {
    name:      userData.displayName ?? userData.name,
    email:     userData.email,
    taxId:     userData.cpf,
    cellphone: userData.phone,
  } : undefined;

  const pixPayload: Record<string, unknown> = {
    method: 'PIX',
    data: {
      amount: order.totalCents,
      description: `Pedido #${orderId.slice(-8).toUpperCase()}`,
      expiresIn: 900,
      ...(customerData ? { customer: customerData } : {}),
    },
  };

  const pixRes  = await fetch(`${ABACATEPAY_BASE}/transparents/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ABACATEPAY_KEY}` },
    body: JSON.stringify(pixPayload),
  });

  if (!pixRes.ok) {
    const detail = await pixRes.text();
    console.error('[regenerate-pix] AbacatePay error:', pixRes.status, detail);
    return NextResponse.json({ error: 'Erro ao gerar PIX' }, { status: 502 });
  }

  const pix = (await pixRes.json()).data;
  await ref.update({
    'payment.txId':         pix.id,
    'payment.pixQrCode':    pix.brCodeBase64,
    'payment.pixCopyPaste': pix.brCode,
    'payment.expiresAt':    pix.expiresAt ? new Date(pix.expiresAt) : null,
    updatedAt: new Date().toISOString(),
  });

  return NextResponse.json({
    orderId,
    txId:       pix.id,
    qrCode:     pix.brCodeBase64,
    copyPaste:  pix.brCode,
    expiresAt:  pix.expiresAt,
    totalCents: order.totalCents,
  });
}
