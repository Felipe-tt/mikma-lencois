export const dynamic = 'force-dynamic';
import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { verifyAuth } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { SHARE_DAYS } from '@/lib/sharedCart';

/** POST: cria (ou troca) o link "Montar junto" do carrinho. DELETE: desliga. */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;
  const uid = auth.decoded.uid;
  if (!await rateLimit(`cart-share:${uid}`, 10, 60 * 60_000)) {
    return NextResponse.json({ error: 'Muitos links criados. Tente mais tarde.' }, { status: 429 });
  }
  const token = randomBytes(16).toString('base64url');
  const expiresAt = Timestamp.fromMillis(Date.now() + SHARE_DAYS * 86_400_000);
  const cartRef = adminDb.collection('carts').doc(uid);
  await adminDb.runTransaction(async tx => {
    const old = (await tx.get(cartRef)).data()?.share?.token;
    if (typeof old === 'string' && old) tx.delete(adminDb.collection('sharedCarts').doc(old));
    tx.set(adminDb.collection('sharedCarts').doc(token), { uid, expiresAt });
    tx.set(cartRef, { userId: uid, share: { token, expiresAt } }, { merge: true });
  });
  return NextResponse.json({ token, expiresAt: expiresAt.toMillis() });
}

export async function DELETE(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;
  const cartRef = adminDb.collection('carts').doc(auth.decoded.uid);
  await adminDb.runTransaction(async tx => {
    const old = (await tx.get(cartRef)).data()?.share?.token;
    if (typeof old === 'string' && old) tx.delete(adminDb.collection('sharedCarts').doc(old));
    tx.set(cartRef, { share: FieldValue.delete() }, { merge: true });
  });
  return NextResponse.json({ ok: true });
}
