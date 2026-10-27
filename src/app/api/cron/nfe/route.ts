export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { adminDb } from '@/lib/firebase/admin';
import { getSettings } from '@/lib/settings';
import { nfeConfigFrom, type NfeEnvironment } from '@/lib/nfe/config';
import { issueNfe, nfeField, syncNfe } from '@/lib/nfe/service';

const PAID = new Set(['paid', 'preparing', 'shipped', 'delivered']);
const BACKLOG_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * GET /api/cron/nfe (a cada 10 min): confere na Focus as notas em
 * processamento (reenvia as que nunca chegaram) e, com a emissão automática
 * ligada, emite as dos pedidos pagos que ficaram sem nota.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret');
  const expected = process.env.CRON_SECRET;
  if (!secret || !expected || secret.length !== expected.length || !timingSafeEqual(Buffer.from(secret), Buffer.from(expected))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = { synced: 0, issued: 0, errors: 0 };
  const run = async (fn: () => Promise<unknown>) => {
    try { await fn(); } catch (err) { results.errors++; console.error('[cron nfe]', err); }
  };

  for (const env of ['producao', 'homologacao'] as NfeEnvironment[]) {
    const pending = await adminDb.collection('orders').where(`${nfeField(env)}.status`, '==', 'processando').limit(50).get();
    for (const doc of pending.docs) await run(async () => { await syncNfe(doc.id, env); results.synced++; });
  }

  const settings = await getSettings() as unknown as Record<string, unknown>;
  const config = nfeConfigFrom(settings);
  if (config.autoEmit) {
    // Só pedidos pagos depois de ligar a emissão automática (e no máximo 3
    // dias): os anteriores podem já ter nota emitida por outro meio.
    const since = Math.max(Date.parse(String(settings.nfeAutoEmitSince ?? '')) || Date.now(), Date.now() - BACKLOG_MS);
    const paid = await adminDb.collection('orders').where('payment.paidAt', '>=', new Date(since)).limit(100).get();
    const field = nfeField(config.environment);
    for (const doc of paid.docs) {
      const order = doc.data();
      if (!PAID.has(order.status as string) || order[field]) continue;
      await run(async () => { await issueNfe(doc.id, config.environment, { by: 'cron' }); results.issued++; });
    }
  }

  console.log('[cron nfe]', results);
  return NextResponse.json({ ok: true, ...results });
}
