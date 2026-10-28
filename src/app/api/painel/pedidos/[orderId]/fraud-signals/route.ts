export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer, validateBody } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { assessOrderRisk, releaseOrderRisk, storeOrderRisk } from '@/lib/orders/risk';
import type { OrderRisk } from '@/lib/fraudSignals';

/**
 * Detector de golpe do pedido (equipe). GET: avaliação gravada no pagamento
 * ou, para pedido sem avaliação, calculada na hora (sem gravar).
 * POST release: libera o envio de um pedido segurado; reassess: reavalia.
 * Critérios em src/lib/fraudSignals.ts (assessRisk).
 */
async function staff(req: NextRequest): Promise<{ uid: string; name: string } | NextResponse> {
  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    const role = (decoded as { role?: string }).role ?? '';
    if (role !== 'seller' && role !== 'admin') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    return { uid: decoded.uid, name: decoded.email ?? decoded.uid };
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const who = await staff(req);
  if (who instanceof NextResponse) return who;
  const snap = await adminDb.collection('orders').doc(orderId).get();
  if (!snap.exists) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
  const stored = snap.get('risk') as OrderRisk | undefined;
  if (stored) return NextResponse.json({ risk: stored, stored: true });
  const live = await assessOrderRisk(orderId);
  return NextResponse.json({ risk: live ? { ...live, hold: false } : null, stored: false });
}

const bodySchema = z.object({ action: z.enum(['release', 'reassess']) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const who = await staff(req);
  if (who instanceof NextResponse) return who;
  if (!await rateLimit(`risk:${who.uid}`, 20, 60_000)) return NextResponse.json({ error: 'Muitas tentativas' }, { status: 429 });
  const parsed = await validateBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  if (parsed.data.action === 'release') {
    const ok = await releaseOrderRisk(orderId, who.name);
    if (!ok) return NextResponse.json({ error: 'Este pedido não está segurado.' }, { status: 409 });
  } else {
    await storeOrderRisk(orderId);
  }
  return NextResponse.json({ risk: (await adminDb.collection('orders').doc(orderId).get()).get('risk') ?? null });
}
