export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { notifyRestockRequests } from '@/lib/restockRequests';

// Avisa quem pediu "avise-me quando chegar" das variações que voltaram ao
// estoque. Workflow próprio, de hora em hora (restock-requests.yml).
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret');
  const expected = process.env.CRON_SECRET;
  const isValid = !!secret && !!expected && secret.length === expected.length
    && timingSafeEqual(Buffer.from(secret), Buffer.from(expected));
  if (!isValid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await notifyRestockRequests();
  return NextResponse.json({ ok: true, ...result });
}
