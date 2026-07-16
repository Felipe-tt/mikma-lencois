export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.split('Bearer ')[1];
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token, true); // checkRevoked=true
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  // Rate limit: 5 exports por usuário por hora
  const key = `export:${uid}`;
  if (!await rateLimit(key, 5, 60 * 60 * 1000)) {
    const retryAfter = Math.ceil(rateLimitRetryAfter(key) / 1000);
    return NextResponse.json(
      { error: 'Muitas tentativas.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  try {
    const [userSnap, ordersSnap] = await Promise.all([
      adminDb.doc(`users/${uid}`).get(),
      adminDb.collection('orders').where('userId', '==', uid).get(),
    ]);

    const userData = { ...(userSnap.data() ?? {}) };
    // Remove campos sensíveis
    delete userData.passwordHash;
    delete userData.lgpdConsent;

    const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const exportData = {
      exportedAt: new Date().toISOString(),
      user: { uid, ...userData },
      orders,
    };

    const filename = `meus-dados-${Date.now()}.json`; // não expõe uid no filename

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[user/export]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
