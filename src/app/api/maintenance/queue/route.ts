export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getClientIp } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { maintenanceDocId, safeReferer, clip, isBotUserAgent } from '@/lib/maintenanceQueue';

/**
 * POST /api/maintenance/queue
 *
 * Coloca o visitante na fila de "quem está esperando" da manutenção. Antes
 * isso acontecia no proxy, a cada requisição de qualquer IP: robô com
 * user-agent de navegador (a maioria dos scrapers hoje) entrava na fila e o
 * painel virava um flood de IPs.
 *
 * Agora quem chama é a própria página /manutencao, pelo navegador, depois de
 * alguns segundos aberta. Robô quase nunca executa JavaScript nem espera, e
 * os cabeçalhos abaixo só vêm de navegador de verdade (fetch same-origin).
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const ua = req.headers.get('user-agent') ?? '';

  // Sinais de navegador real: fetch disparado pela própria página.
  const sameOrigin = req.headers.get('sec-fetch-site') === 'same-origin';
  const hasLanguage = !!req.headers.get('accept-language');
  if (!sameOrigin || !hasLanguage || !ua || isBotUserAgent(ua)) {
    return new NextResponse(null, { status: 204 });
  }

  if (!await rateLimit(`maintenance-queue:${ip}`, 3, 10 * 60_000)) {
    return new NextResponse(null, { status: 204 });
  }

  let body: { waitedMs?: unknown; path?: unknown } = {};
  try { body = await req.json(); } catch { /* corpo vazio */ }
  // A página só chama depois de ficar alguns segundos aberta e visível.
  if (typeof body.waitedMs !== 'number' || body.waitedMs < 2500) {
    return new NextResponse(null, { status: 204 });
  }

  const status = await adminDb.doc('maintenance/status').get();
  if (!status.exists || !status.data()?.active) return new NextResponse(null, { status: 204 });

  const docId = await maintenanceDocId(ip, process.env.STAFF_SESSION_SECRET);
  const ref = adminDb.doc(`maintenance_queue/${docId}`);
  const existing = await ref.get();
  // Já liberado ou já na fila: só atualiza quando voltou, não duplica.
  if (existing.exists) {
    await ref.update({ lastSeenAt: new Date().toISOString() });
    return new NextResponse(null, { status: 204 });
  }

  await ref.set({
    ip: clip(ip, 45),
    released: false,
    enteredAt: new Date().toISOString(),
    userAgent: clip(ua, 300),
    isBot: false,
    referer: safeReferer(req.headers.get('referer')),
    acceptLanguage: clip(req.headers.get('accept-language'), 100),
    requestedPath: typeof body.path === 'string' ? clip(body.path.split('?')[0], 200) : '',
    platform: clip((req.headers.get('sec-ch-ua-platform') ?? '').replace(/"/g, ''), 30),
    isMobile: clip(req.headers.get('sec-ch-ua-mobile'), 10),
  });
  return new NextResponse(null, { status: 204 });
}
