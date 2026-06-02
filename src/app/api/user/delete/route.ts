export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export async function DELETE(req: NextRequest) {
  const token = req.headers.get('authorization')?.split('Bearer ')[1];
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  // delete all user data from Firestore
  const batch = adminDb.batch();
  batch.delete(adminDb.doc(`users/${uid}`));
  batch.delete(adminDb.doc(`carts/${uid}`));

  // delete user notifications subcollection
  const notifSnap = await adminDb.collection(`notifications/${uid}/items`).get();
  notifSnap.docs.forEach(d => batch.delete(d.ref));

  await batch.commit();

  // delete Firebase Auth account
  await adminAuth.deleteUser(uid);

  return NextResponse.json({ ok: true });
}
