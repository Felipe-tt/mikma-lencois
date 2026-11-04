import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { sendReviewReminders } from '@/lib/reviewReminders';

// Lembrete de avaliação alguns dias depois da entrega (um por pedido).
// Workflow próprio, uma vez por dia (review-reminders.yml).
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret');
  const expected = process.env.CRON_SECRET;
  const isValid = !!secret && !!expected && secret.length === expected.length
    && timingSafeEqual(Buffer.from(secret), Buffer.from(expected));
  if (!isValid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await sendReviewReminders();
  return NextResponse.json({ ok: true, ...result });
}
