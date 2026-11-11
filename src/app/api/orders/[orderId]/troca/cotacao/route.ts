import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer, validateBody } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { getSettings } from '@/lib/settings';
import { calcularTroca } from '@/lib/returns/reenvio';
import { novosSchema } from '@/lib/returns/novosSchema';
import type { Order } from '@/types';

/**
 * POST /api/orders/[orderId]/troca/cotacao: antes de pedir a troca, o
 * cliente vê quanto paga (diferença de preço e frete do novo envio) ou
 * quanto recebe de volta.
 */
const schema = z.object({
  defeito: z.boolean().optional(),
  items: z.array(z.object({ sku: z.string().min(1).max(120), quantity: z.number().int().min(1).max(50) })).min(1).max(30),
  novos: novosSchema,
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;
  let uid: string;
  try { uid = (await adminAuth.verifyIdToken(bearer.token, true)).uid; } catch {
    return NextResponse.json({ error: 'Sua sessão expirou. Entre de novo.' }, { status: 401 });
  }
  if (!await rateLimit(`troca-cotacao:${uid}`, 30, 60 * 60_000)) return NextResponse.json({ error: 'Muitas tentativas. Tente de novo mais tarde.' }, { status: 429 });
  const parsed = await validateBody(req, schema, 8_192);
  if (!parsed.ok) return parsed.response;
  const order = (await adminDb.collection('orders').doc(orderId).get()).data() as Order | undefined;
  if (!order || order.userId !== uid) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });

  const devolvidos = parsed.data.items.map(it => {
    const b = order.items.find(i => i.sku === it.sku);
    return { unitPrice: b?.unitPrice ?? 0, quantity: Math.min(it.quantity, b?.quantity ?? 0) };
  });
  const r = await calcularTroca(order, devolvidos, parsed.data.novos, parsed.data.defeito === true, await getSettings());
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  const c = r.calculo;
  return NextResponse.json({ diferencaCents: c.diferencaCents, freteCents: c.freteCents, saldoCents: c.saldoCents, freteLabel: c.frete.label });
}
