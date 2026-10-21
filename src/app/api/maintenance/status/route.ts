export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getClientIp } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { STAFF_SESSION_COOKIE, verifyStaffSession } from '@/lib/staffSession';
import { maintenanceDocId } from '@/lib/maintenanceQueue';

// Endpoint público (sem auth) consultado via polling pela página /manutencao
// (pra saber quando sair de lá sozinha) e pelo MaintenanceGate (fallback
// client-side pra quando uma página cacheada é servida sem passar pelo
// middleware). Não expõe nada sensível: só se a manutenção está ativa e se
// quem está perguntando já pode ver o site (IP liberado OU staff logado).
const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } };

export async function GET(req: NextRequest) {
  // Staff logado vem antes do limite: antes, um 429 respondia "não liberado"
  // e o admin entrava num vaivém entre a home e /manutencao.
  const staffCookie = req.cookies.get(STAFF_SESSION_COOKIE)?.value;
  const staffSecret = process.env.STAFF_SESSION_SECRET;
  const isStaff = !!(staffCookie && staffSecret && await verifyStaffSession(staffCookie, staffSecret));

  const ip = getClientIp(req);
  // Rate limit: 20 req/min por IP, cobre um polling de ~20s com folga. Estourou:
  // 429, e o cliente não muda de página (o proxy já barra quem não pode ver).
  if (!isStaff && !await rateLimit(`maintenance-status:${ip}`, 20, 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas consultas' }, { status: 429, ...NO_STORE });
  }

  const statusSnap = await adminDb.doc('maintenance/status').get();
  const active = statusSnap.exists ? (statusSnap.data()?.active ?? false) : false;

  if (!active) {
    // Sem manutenção (o normal): a CDN pode responder por 10s, então cada
    // visita deixa de bater no Cloud Run, Upstash e Firestore. Com manutenção
    // ativa a resposta segue sem cache (depende do IP e do cookie).
    return NextResponse.json({ active: false, released: false }, {
      headers: { 'Cache-Control': 'public, max-age=0, s-maxage=10, stale-while-revalidate=20' },
    });
  }

  // Mesma checagem de bypass do proxy.ts: sem isso, o MaintenanceGate
  // chutava staff logado pra /manutencao mesmo com o proxy deixando passar.
  if (isStaff) return NextResponse.json({ active, released: true }, NO_STORE);

  const docId = await maintenanceDocId(ip, process.env.STAFF_SESSION_SECRET);
  const queueSnap = await adminDb.doc(`maintenance_queue/${docId}`).get();
  const released = queueSnap.exists ? (queueSnap.data()?.released ?? false) : false;

  return NextResponse.json({ active, released }, NO_STORE);
}
