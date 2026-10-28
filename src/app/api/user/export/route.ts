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
    // Tudo o que a loja guarda ligado à conta (LGPD, direito de acesso),
    // não só perfil e pedidos.
    const email = (await adminAuth.getUser(uid).catch(() => null))?.email?.toLowerCase();
    const [userSnap, ordersSnap, cartSnap, wishSnap, reviewsSnap, returnsSnap, restockSnap] = await Promise.all([
      adminDb.doc(`users/${uid}`).get(),
      adminDb.collection('orders').where('userId', '==', uid).get(),
      adminDb.doc(`carts/${uid}`).get(),
      adminDb.doc(`wishlists/${uid}`).get(),
      adminDb.collection('reviews').where('userId', '==', uid).get(),
      adminDb.collection('returns').where('userId', '==', uid).get(),
      email ? adminDb.collection('restockRequests').where('email', '==', email).get() : null,
    ]);

    const userData = { ...(userSnap.data() ?? {}) };
    // Remove campos sensíveis
    delete userData.passwordHash;

    // Custo real do frete é dado interno da loja, não do cliente.
    const orders = ordersSnap.docs.map(d => {
      const o = d.data();
      if (o.delivery) { const { realPriceCents: _cost, ...delivery } = o.delivery; o.delivery = delivery; }
      return { id: d.id, ...o };
    });

    const exportData = {
      exportedAt: new Date().toISOString(),
      user: { uid, ...userData },
      orders,
      cart: cartSnap.data() ?? null,
      wishlist: wishSnap.data() ?? null,
      reviews: reviewsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      returns: returnsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      restockRequests: restockSnap?.docs.map(d => ({ id: d.id, ...d.data() })) ?? [],
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
