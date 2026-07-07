export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getClientIp } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';

// Endpoint público (sem auth) consultado via polling pela página /manutencao
// para saber quando pode sair de lá sozinha — sem exigir refresh manual do
// visitante. Não expõe nada sensível: só se a manutenção está ativa e se o
// IP de quem está perguntando já foi liberado.
export async function GET(req: NextRequest) {
  const ip = getClientIp(req);

  // Rate limit: 20 req/min por IP — cobre um polling de ~5s com folga.
  if (!rateLimit(`maintenance-status:${ip}`, 20, 60 * 1000)) {
    // Silencioso: mantém o cliente em manutenção em vez de expor o limite.
    return NextResponse.json({ active: true, released: false });
  }

  const statusSnap = await adminDb.doc('maintenance/status').get();
  const active = statusSnap.exists ? (statusSnap.data()?.active ?? false) : false;

  if (!active) {
    return NextResponse.json({ active: false, released: false });
  }

  const docId = ip.replace(/[.:]/g, '_');
  const queueSnap = await adminDb.doc(`maintenance_queue/${docId}`).get();
  const released = queueSnap.exists ? (queueSnap.data()?.released ?? false) : false;

  return NextResponse.json({ active, released });
}
