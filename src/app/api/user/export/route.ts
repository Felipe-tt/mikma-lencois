export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.split('Bearer ')[1];
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const [userSnap, ordersSnap] = await Promise.all([
    adminDb.doc(`users/${uid}`).get(),
    adminDb.collection('orders').where('userId', '==', uid).get(),
  ]);

  const userData = userSnap.data() ?? {};
  // remove sensitive internal fields
  delete userData.passwordHash;

  const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const exportData = {
    exportedAt: new Date().toISOString(),
    user: { uid, ...userData },
    orders,
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="meus-dados-${uid}.json"`,
    },
  });
}
