export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

export async function GET(req: NextRequest) {
  const ip = req.nextUrl.searchParams.get('ip') ?? '0.0.0.0';
  const idToken = req.nextUrl.searchParams.get('token') ?? '';

  const snap = await adminDb.doc('maintenance/status').get();
  const active = snap.exists ? (snap.data()?.active ?? false) : false;

  if (!active) return NextResponse.json({ active: false, allowed: true });

  // tenta identificar usuário logado pelo token
  let uid: string | null = null;
  let email: string | null = null;
  let displayName: string | null = null;

  if (idToken) {
    try {
      const decoded = await adminAuth.verifyIdToken(idToken);
      uid = decoded.uid;
      email = decoded.email ?? null;
      displayName = decoded.name ?? null;
    } catch { /* token inválido, trata como anônimo */ }
  }

  // ID do doc: uid se logado, senão IP
  const docId = uid ? `user_${uid}` : ip.replace(/[./]/g, '_');
  const qSnap = await adminDb.doc(`maintenance_queue/${docId}`).get();
  const released = qSnap.exists && qSnap.data()?.released === true;

  // registra na queue se ainda não estiver
  if (!qSnap.exists) {
    await adminDb.doc(`maintenance_queue/${docId}`).set({
      ip,
      ...(uid ? { uid, email, displayName } : {}),
      released: false,
      enteredAt: new Date().toISOString(),
    });
  } else if (uid && !qSnap.data()?.uid) {
    // atualiza doc de IP existente com dados do usuário
    await adminDb.doc(`maintenance_queue/${docId}`).set(
      { uid, email, displayName },
      { merge: true }
    );
  }

  return NextResponse.json({ active: true, allowed: released });
}
