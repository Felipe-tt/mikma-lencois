import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp, tooManyRequests, validateBody } from '@/lib/security';
import type { CartItem } from '@/types';

const schema = z.object({ guestToken: z.string().min(20).max(4096) });

// Convidado ("comprar sem cadastro") entrou numa conta: passa o carrinho e
// os pedidos dele para a conta. A posse do convidado é provada pelo token
// dele (guardado no navegador antes do login), não por um uid solto.
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const key = `merge-guest:ip:${ip}`;
  if (!await rateLimit(key, 10, 60 * 60 * 1000)) return tooManyRequests(rateLimitRetryAfter(key));

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const body = await validateBody(req, schema);
  if (!body.ok) return body.response;

  let account, guest;
  try {
    account = await adminAuth.verifyIdToken(authHeader.slice(7));
    guest = await adminAuth.verifyIdToken(body.data.guestToken);
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }
  if (guest.firebase?.sign_in_provider !== 'anonymous' || account.firebase?.sign_in_provider === 'anonymous') {
    return NextResponse.json({ error: 'Nada a juntar' }, { status: 400 });
  }
  if (guest.uid === account.uid) return NextResponse.json({ ok: true, merged: 0 });

  // Só junta se o convidado deu o mesmo e-mail da conta (e a conta tem o
  // e-mail confirmado). Num computador compartilhado, quem entra depois
  // numa conta própria não herda os pedidos e o endereço do convidado.
  const guestEmail = (await adminDb.collection('users').doc(guest.uid).get()).data()?.email;
  const accountEmail = account.email?.toLowerCase();
  if (!account.email_verified || !accountEmail || typeof guestEmail !== 'string' || guestEmail.toLowerCase() !== accountEmail) {
    return NextResponse.json({ ok: true, merged: 0, skipped: 'email' });
  }

  // Carrinho: soma os itens do convidado aos da conta (mesmo SKU e mesma
  // observação viram uma linha só).
  const guestCartRef = adminDb.collection('carts').doc(guest.uid);
  const accountCartRef = adminDb.collection('carts').doc(account.uid);
  await adminDb.runTransaction(async tx => {
    const [g, a] = await Promise.all([tx.get(guestCartRef), tx.get(accountCartRef)]);
    const guestItems = (g.data()?.items ?? []) as CartItem[];
    if (guestItems.length === 0) return;
    const items = [...((a.data()?.items ?? []) as CartItem[])];
    for (const it of guestItems) {
      const same = items.find(x => x.sku === it.sku && (x.note ?? '') === (it.note ?? '') && (x.swapSku ?? '') === (it.swapSku ?? ''));
      if (same) same.quantity = Math.min(99, same.quantity + it.quantity);
      else items.push(it);
    }
    tx.set(accountCartRef, { userId: account.uid, items: items.slice(0, 50), updatedAt: new Date().toISOString() }, { merge: true });
    tx.delete(guestCartRef);
  });

  // Pedidos feitos como convidado passam a aparecer na conta.
  const orders = await adminDb.collection('orders').where('userId', '==', guest.uid).limit(50).get();
  const batch = adminDb.batch();
  orders.docs.forEach(d => batch.update(d.ref, { userId: account.uid, mergedFromGuest: guest.uid }));
  batch.delete(adminDb.collection('users').doc(guest.uid));
  await batch.commit();
  await adminAuth.deleteUser(guest.uid).catch(() => {});

  return NextResponse.json({ ok: true, merged: orders.size });
}
