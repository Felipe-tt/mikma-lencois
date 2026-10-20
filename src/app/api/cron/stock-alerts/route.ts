export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { notifyStockAlerts } from '@/lib/stockAlerts';

// Avisa quem pediu "avise-me quando chegar" dos produtos que voltaram ao
// estoque. Chamado pelo mesmo workflow do cron de expirar pedidos.
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret');
  const expected = process.env.CRON_SECRET;
  const isValid = !!secret && !!expected && secret.length === expected.length
    && timingSafeEqual(Buffer.from(secret), Buffer.from(expected));
  if (!isValid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await notifyStockAlerts();
  return NextResponse.json({ ok: true, ...result });
}
