export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { adminDb } from '@/lib/firebase/admin';

/**
 * GET /api/cron/health (com x-cron-secret): saúde do servidor para o
 * monitor pós-deploy (.github/workflows/saude-site.yml). Lê do banco e
 * confere se as configurações essenciais existem. Só devolve sim/não,
 * nunca valores.
 */
const REQUIRED_ENV = ['FIREBASE_PRIVATE_KEY', 'ABACATEPAY_API_KEY', 'ABACATEPAY_WEBHOOK_SECRET', 'CRON_SECRET', 'STAFF_SESSION_SECRET'];

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret');
  const expected = process.env.CRON_SECRET;
  if (!secret || !expected || secret.length !== expected.length || !timingSafeEqual(Buffer.from(secret), Buffer.from(expected))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const started = Date.now();
  let firestore = false;
  try {
    await Promise.race([
      adminDb.collection('settings').doc('store').get(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8_000)),
    ]);
    firestore = true;
  } catch { /* firestore = false */ }
  const env = Object.fromEntries(REQUIRED_ENV.map(k => [k, !!process.env[k]]));
  const ok = firestore && Object.values(env).every(Boolean);
  return NextResponse.json(
    { ok, firestore, env, version: process.env.NEXT_PUBLIC_BUILD_VERSION ?? '', ms: Date.now() - started },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
