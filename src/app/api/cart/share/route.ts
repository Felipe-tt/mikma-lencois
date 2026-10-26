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
  // Primeiro nome, pra quem abre o link ver "Carrinho da Ana".
  const fullName = String((await adminDb.collection('users').doc(uid).get()).data()?.name ?? auth.decoded.name ?? '');
  const ownerName = fullName.trim().split(/\s+/)[0]?.slice(0, 24) ?? '';
  await adminDb.runTransaction(async tx => {
    const old = (await tx.get(cartRef)).data()?.share?.token;
    if (typeof old === 'string' && old) tx.delete(adminDb.collection('sharedCarts').doc(old));
    tx.set(adminDb.collection('sharedCarts').doc(token), { uid, expiresAt });
    // set com merge mescla mapas: o share antigo sai antes.
    tx.set(cartRef, { userId: uid, share: FieldValue.delete() }, { merge: true });
    tx.set(cartRef, { share: { token, expiresAt, ownerName, log: [], addedBy: {}, viewers: {} } }, { merge: true });
  });
  return NextResponse.json({ token, expiresAt: expiresAt.toMillis() });
}

/** PATCH: renova o link por mais SHARE_DAYS dias, sem trocar o endereço. */
export async function PATCH(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;
  const cartRef = adminDb.collection('carts').doc(auth.decoded.uid);
  const expiresAt = Timestamp.fromMillis(Date.now() + SHARE_DAYS * 86_400_000);
  const ok = await adminDb.runTransaction(async tx => {
    const share = (await tx.get(cartRef)).data()?.share;
    if (!share?.token || share.paidAt) return false;
    tx.set(adminDb.collection('sharedCarts').doc(share.token), { uid: auth.decoded.uid, expiresAt });
    tx.update(cartRef, { 'share.expiresAt': expiresAt });
    return true;
  });
  if (!ok) return NextResponse.json({ error: 'Nenhum link ligado.' }, { status: 404 });
  return NextResponse.json({ expiresAt: expiresAt.toMillis() });
}

/** PUT: o dono está com o carrinho aberto (aparece como online pra quem tem o link). */
export async function PUT(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;
  if (!await rateLimit(`cart-share-ping:${auth.decoded.uid}`, 6, 60_000)) return NextResponse.json({ ok: true });
  const cartRef = adminDb.collection('carts').doc(auth.decoded.uid);
  const share = (await cartRef.get()).data()?.share;
  if (!share?.token) return NextResponse.json({ ok: false });
  await cartRef.update({ 'share.viewers.owner': { name: share.ownerName || 'Dono', at: Date.now(), owner: true } });
  return NextResponse.json({ ok: true });
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
