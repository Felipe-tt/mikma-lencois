export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getClientIp } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { STAFF_SESSION_COOKIE, verifyStaffSession } from '@/lib/staffSession';

// Endpoint público (sem auth) consultado via polling pela página /manutencao
// (pra saber quando sair de lá sozinha) e pelo MaintenanceGate (fallback
// client-side pra quando uma página cacheada é servida sem passar pelo
// middleware). Não expõe nada sensível: só se a manutenção está ativa e se
// quem está perguntando já pode ver o site (IP liberado OU staff logado).
export async function GET(req: NextRequest) {
  const ip = getClientIp(req);

  // Rate limit: 20 req/min por IP — cobre um polling de ~5s com folga.
  if (!await rateLimit(`maintenance-status:${ip}`, 20, 60 * 1000)) {
    // Silencioso: mantém o cliente em manutenção em vez de expor o limite.
    return NextResponse.json({ active: true, released: false });
  }

  const statusSnap = await adminDb.doc('maintenance/status').get();
  const active = statusSnap.exists ? (statusSnap.data()?.active ?? false) : false;

  if (!active) {
    return NextResponse.json({ active: false, released: false });
  }

  // Mesma checagem de bypass do middleware.ts — sem isso, o MaintenanceGate
  // (que só olha esse endpoint) chutava staff logado pra /manutencao mesmo
  // com o middleware já deixando a página passar, porque essa rota só
  // sabia responder com base em IP liberado.
  const staffCookie = req.cookies.get(STAFF_SESSION_COOKIE)?.value;
  const staffSecret = process.env.STAFF_SESSION_SECRET;
  if (staffCookie && staffSecret) {
    const staff = await verifyStaffSession(staffCookie, staffSecret);
    if (staff) return NextResponse.json({ active, released: true });
  }

  const docId = ip.replace(/[.:]/g, '_');
  const queueSnap = await adminDb.doc(`maintenance_queue/${docId}`).get();
  const released = queueSnap.exists ? (queueSnap.data()?.released ?? false) : false;

  return NextResponse.json({ active, released });
}
