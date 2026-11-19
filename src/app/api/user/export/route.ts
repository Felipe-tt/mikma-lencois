import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { conversationIdFor } from '@/lib/email/conversationId';
import { withPii } from '@/lib/piiCrypto';
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
    const [userSnap, ordersSnap, cartSnap, wishSnap, reviewsSnap, returnsSnap, restockSnap, messagesSnap, passkeysSnap] = await Promise.all([
      adminDb.doc(`users/${uid}`).get(),
      adminDb.collection('orders').where('userId', '==', uid).get(),
      adminDb.doc(`carts/${uid}`).get(),
      adminDb.doc(`wishlists/${uid}`).get(),
      adminDb.collection('reviews').where('userId', '==', uid).get(),
      adminDb.collection('returns').where('userId', '==', uid).get(),
      email ? adminDb.collection('restockRequests').where('email', '==', email).get() : null,
      // Mensagens trocadas com o atendimento por e-mail (a política cita
      // "mensagens para o atendimento" entre os dados guardados).
      email ? adminDb.collection('conversations').doc(conversationIdFor(email)).collection('messages').limit(500).get() : null,
      adminDb.collection('passkeys').where('uid', '==', uid).get(),
    ]);

    // CPF e telefone abertos (no banco ficam criptografados), sem os campos
    // internos da criptografia.
    const userData: Record<string, unknown> = withPii(userSnap.data());
    for (const k of ['passwordHash', 'cpfEnc', 'phoneEnc', 'cpfHash']) delete userData[k];

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
      supportMessages: messagesSnap?.docs.map(d => {
        const m = d.data();
        return { direction: m.direction, subject: m.subject, text: m.text, createdAt: m.createdAt, attachments: (m.attachments ?? []).map((a: { filename?: string }) => a.filename).filter(Boolean) };
      }) ?? [],
      // Só o nome e as datas: a chave pública não diz nada sobre a pessoa.
      passkeys: passkeysSnap.docs.map(d => {
        const p = d.data();
        return { name: p.name, createdAt: p.createdAt, lastUsedAt: p.lastUsedAt };
      }),
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
