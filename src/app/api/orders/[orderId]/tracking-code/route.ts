import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer, validateBody } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { isManualDispatch, isValidTrackingCodeFor, normalizeTrackingCode, type CarrierKey } from '@/lib/carriers';
import { effectiveRole } from '@/lib/staffMfa';

const bodySchema = z.object({
  trackingCode: z.string().trim().min(1).max(60),
});

/**
 * POST /api/orders/[orderId]/tracking-code
 *
 * Corrige o código de rastreio de um pedido já despachado (Correios/Jadlog).
 * Antes o único jeito era "Cancelar entrega" e despachar de novo, o que
 * mandava um segundo e-mail de "pedido enviado" pro cliente.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;

  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;
  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    const role = effectiveRole(decoded);
    if (role !== 'seller' && role !== 'admin') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }
  if (!await rateLimit(`tracking-code:${uid}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco.' }, { status: 429 });
  }

  const parsed = await validateBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const code = normalizeTrackingCode(parsed.data.trackingCode);

  const ref = adminDb.collection('orders').doc(orderId);
  const result = await adminDb.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return 'NOT_FOUND';
    const order = snap.data()!;
    if (order.status !== 'shipped') return 'NOT_SHIPPED';
    const carrier = (order.delivery?.carrier ?? order.selectedShipping?.carrier ?? '') as CarrierKey;
    if (!isManualDispatch(carrier)) return 'NOT_MANUAL';
    if (!isValidTrackingCodeFor(carrier, code)) return 'INVALID';
    const previous = order.delivery?.trackingCode as string | undefined;
    if (previous === code) return 'OK';
    tx.update(ref, {
      'delivery.trackingCode': code,
      updatedAt: FieldValue.serverTimestamp(),
      timeline: FieldValue.arrayUnion({
        status: 'shipped',
        at: new Date().toISOString(),
        note: `Código de rastreio corrigido${previous ? ` (era ${previous})` : ''}`,
      }),
    });
    return 'OK';
  });

  if (result === 'NOT_FOUND') return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
  if (result === 'NOT_SHIPPED') return NextResponse.json({ error: 'Só dá pra corrigir o código de um pedido já enviado.' }, { status: 409 });
  if (result === 'NOT_MANUAL') return NextResponse.json({ error: 'Esta entrega não usa código de rastreio.' }, { status: 400 });
  if (result === 'INVALID') return NextResponse.json({ error: 'Código de rastreio inválido para esta transportadora.' }, { status: 400 });
  return NextResponse.json({ ok: true, trackingCode: code });
}
