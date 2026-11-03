import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { runRetention } from '@/lib/retention';

// Prazos de retenção da LGPD (ver lib/retention.ts). Uma vez por dia, pelo
// Worker de rotinas (workers/cron/schedule.mjs).
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret');
  const expected = process.env.CRON_SECRET;
  const isValid = !!secret && !!expected && secret.length === expected.length
    && timingSafeEqual(Buffer.from(secret), Buffer.from(expected));
  if (!isValid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await runRetention(adminDb, adminAuth);
  return NextResponse.json({ ok: true, ...result });
}
