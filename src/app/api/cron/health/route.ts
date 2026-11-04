import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { adminDb, getAdminAppCheck } from '@/lib/firebase/admin';
import { envPrivateKey, signRsaSha256Hex } from '@/lib/firebase/signer';

/**
 * GET /api/cron/health (com x-cron-secret): saúde do servidor para o
 * monitor pós-deploy (.github/workflows/saude-site.yml). Lê do banco e
 * confere se as configurações essenciais existem. Só devolve sim/não,
 * nunca valores.
 *
 * `signing`: a conta do servidor consegue assinar pela API IAM (passkey e
 * envio de foto dependem disso). Só no Cloud Run (K_SERVICE), e só conta
 * para o `ok` quando não há chave fixa no ambiente.
 *
 * `appCheck`: o servidor consegue emitir token do App Check (provedor
 * próprio, src/app/api/app-check). Só informa, não conta para o `ok`.
 */
const REQUIRED_ENV = ['ABACATEPAY_API_KEY', 'ABACATEPAY_WEBHOOK_SECRET', 'CRON_SECRET', 'STAFF_SESSION_SECRET'];

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
  let signing: boolean | null = null;
  if (process.env.K_SERVICE) {
    try {
      signing = (await signRsaSha256Hex('health', { forceIam: true })).length > 0;
    } catch (err) {
      console.error('[health] assinatura pela API IAM falhou', err);
      signing = false;
    }
  }
  let appCheck: boolean | null = null;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  if (process.env.K_SERVICE && appId) {
    try {
      appCheck = !!(await getAdminAppCheck().createToken(appId, { ttlMillis: 30 * 60 * 1000 })).token;
    } catch (err) {
      console.error('[health] App Check não emitiu token', err);
      appCheck = false;
    }
  }
  const env = Object.fromEntries(REQUIRED_ENV.map(k => [k, !!process.env[k]]));
  const ok = firestore && Object.values(env).every(Boolean) && (signing !== false || !!envPrivateKey());
  return NextResponse.json(
    { ok, firestore, signing, appCheck, env, version: process.env.NEXT_PUBLIC_BUILD_VERSION ?? '', ms: Date.now() - started },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
