export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

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

  // Cancel any pending orders before deleting account
  const pendingOrders = await adminDb
    .collection('orders')
    .where('userId', '==', uid)
    .where('status', '==', 'pending_payment')
    .get();

  const batch = adminDb.batch();

  for (const orderDoc of pendingOrders.docs) {
    batch.update(orderDoc.ref, {
      status: 'cancelled',
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  // Delete user data
  batch.delete(adminDb.doc(`users/${uid}`));
  batch.delete(adminDb.doc(`carts/${uid}`));

  // Delete notifications subcollection
  const notifSnap = await adminDb.collection(`notifications/${uid}/items`).get();
  for (const d of notifSnap.docs) batch.delete(d.ref);

  await batch.commit();

  // Delete Firebase Auth account last
  await adminAuth.deleteUser(uid);

  return NextResponse.json({ ok: true });
}
