export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { getClientIp, extractBearer } from '@/lib/security';

async function verifySeller(req: NextRequest) {
  const token = extractBearer(req);
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token, true);
    if (decoded.role !== 'seller' && decoded.role !== 'admin') return null;
    return decoded;
  } catch { return null; }
}

// GET — retorna status atual + queue
export async function GET(req: NextRequest) {
  const user = await verifySeller(req);
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const snap = await adminDb.doc('maintenance/status').get();
  const status = snap.exists ? snap.data() : { active: false };

  const queueSnap = await adminDb.collection('maintenance_queue')
    .orderBy('enteredAt', 'desc').limit(200).get();

  const queue = queueSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  return NextResponse.json({ status, queue });
}

// POST — toggle manutenção ou liberar IP
export async function POST(req: NextRequest) {
  const user = await verifySeller(req);
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const body = await req.json();

  // toggle manutenção
  if (body.action === 'toggle') {
    const snap = await adminDb.doc('maintenance/status').get();
    const current = snap.exists ? (snap.data()?.active ?? false) : false;
    await adminDb.doc('maintenance/status').set({
      active: !current,
      updatedAt: new Date().toISOString(),
      updatedBy: user.email ?? user.uid,
    }, { merge: true });
    return NextResponse.json({ active: !current });
  }

  // liberar IP específico
  if (body.action === 'release' && body.ip) {
    await adminDb.collection('maintenance_queue').doc(body.ip.replace(/[./]/g, '_')).set({
      ip: body.ip,
      released: true,
      releasedAt: new Date().toISOString(),
      releasedBy: user.email ?? user.uid,
    }, { merge: true });
    return NextResponse.json({ ok: true });
  }

  // liberar todos
  if (body.action === 'release_all') {
    const queueSnap = await adminDb.collection('maintenance_queue').get();
    const batch = adminDb.batch();
    queueSnap.docs.forEach(d => batch.update(d.ref, {
      released: true,
      releasedAt: new Date().toISOString(),
      releasedBy: user.email ?? user.uid,
    }));
    await batch.commit();
    return NextResponse.json({ ok: true });
  }

  // limpar queue
  if (body.action === 'clear_queue') {
    const queueSnap = await adminDb.collection('maintenance_queue').get();
    const batch = adminDb.batch();
    queueSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
}
