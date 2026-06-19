export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export async function GET(req: NextRequest) {
  const ip = req.nextUrl.searchParams.get('ip') ?? '';

  const snap = await adminDb.doc('maintenance/status').get();
  const active = snap.exists ? (snap.data()?.active ?? false) : false;

  if (!active) return NextResponse.json({ active: false, allowed: true });

  // verifica se IP foi liberado
  const docId = ip.replace(/[./]/g, '_');
  const qSnap = await adminDb.doc(`maintenance_queue/${docId}`).get();
  const released = qSnap.exists && qSnap.data()?.released === true;

  // registra IP na queue se ainda não estiver
  if (!qSnap.exists) {
    await adminDb.doc(`maintenance_queue/${docId}`).set({
      ip,
      released: false,
      enteredAt: new Date().toISOString(),
    });
  }

  return NextResponse.json({ active: true, allowed: released });
}
