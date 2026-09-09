export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { extractBearer, getClientIp, tooManyRequests } from '@/lib/security';

const ABACATEPAY_BASE = 'https://api.abacatepay.com/v2';
// Ver nota em create-pix/route.ts: ambiente é decidido por qual key é
// usada. Precisa usar a MESMA que gerou o pedido original — regenerar
// um PIX de teste com a key de produção (ou vice-versa) criaria uma
// cobrança no ambiente errado, e o webhook de confirmação nunca bateria
// (o txId novo pertenceria a um ambiente diferente do resto do pedido).
function abacatePayKey(sandbox: boolean): string {
  return (sandbox ? process.env.ABACATEPAY_SANDBOX_API_KEY : process.env.ABACATEPAY_API_KEY) ?? '';
}

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
  if (!await rateLimit(ipKey, 20, 60 * 60 * 1000) || !await rateLimit(uidKey, 5, 60 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(uidKey));
  }

  const ref   = adminDb.collection('orders').doc(orderId);
  const snap  = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
  const order = snap.data()!;
  if (order.userId !== uid) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  const allowedStatuses = ['pending_payment', 'payment_expired'];
  if (!allowedStatuses.includes(order.status as string)) {
    return NextResponse.json({ error: 'Pedido não pode ter PIX gerado neste status' }, { status: 400 });
  }

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

  const abacateSandbox = !!(order.payment as { abacateSandbox?: boolean } | undefined)?.abacateSandbox;
  const ABACATEPAY_KEY = abacatePayKey(abacateSandbox);
  if (!ABACATEPAY_KEY) {
    console.error(abacateSandbox ? 'ABACATEPAY_SANDBOX_API_KEY not set' : 'ABACATEPAY_API_KEY not set');
    return NextResponse.json({ error: 'Payment provider not configured' }, { status: 500 });
  }

  const pixPayload: Record<string, unknown> = {
    method: 'PIX',
    data: {
      amount: order.totalCents,
      description: `Pedido #${orderId.slice(-8).toUpperCase()}${abacateSandbox ? ' · TESTE' : ''}`,
      expiresIn: 900,
      externalId: orderId,
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
  const nowIso = new Date().toISOString();
  await ref.update({
    status: 'pending_payment',
    'payment.txId':         pix.id,
    'payment.pixQrCode':    pix.brCodeBase64,
    'payment.pixCopyPaste': pix.brCode,
    'payment.expiresAt':    pix.expiresAt ? new Date(pix.expiresAt) : null,
    updatedAt: nowIso,
    timeline: FieldValue.arrayUnion({
      status: 'payment_initiated',
      at: nowIso,
      note: 'Novo PIX gerado pelo cliente',
    }),
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
