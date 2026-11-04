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

  try {
    const result = await sendReviewReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // Código do erro (ex.: FAILED_PRECONDITION = índice do Firestore ainda
    // sendo criado) no corpo, para o log do workflow dizer o motivo.
    const e = err as { code?: unknown; message?: string };
    console.error('[review-reminders] falhou', err);
    return NextResponse.json({ ok: false, code: String(e.code ?? ''), error: String(e.message ?? '').slice(0, 200) }, { status: 500 });
  }
}
