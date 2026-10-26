export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { getClientIp, validateBody } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { applySharedOp, CHAT_MAX, CHAT_TEXT_MAX, LOG_MAX, TOKEN_RE, VIEWER_TTL_MS, type SharedOp } from '@/lib/sharedCart';
import type { CartItem } from '@/types';

const id = z.string().min(1).max(120);
const schema = z.object({
  by: z.string().trim().max(24).optional(),
  // Id aleatório do navegador, pra lista de quem está online.
  viewer: z.string().regex(/^[A-Za-z0-9]{8,24}$/).optional(),
  change: z.discriminatedUnion('op', [
    z.object({ op: z.literal('ping') }),
    z.object({ op: z.literal('msg'), text: z.string().trim().min(1).max(CHAT_TEXT_MAX) }),
    z.object({ op: z.literal('add'), productId: id, variantId: id }),
    z.object({ op: z.literal('qty'), line: z.string().min(1).max(300), quantity: z.number().int() }),
    z.object({ op: z.literal('swap'), line: z.string().min(1).max(300), swapSku: id.nullable() }),
  ]),
});

/** Alteração feita por quem abriu o link "Montar junto". */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return NextResponse.json({ error: 'Link inválido.' }, { status: 404 });
  if (!await rateLimit(`cart-shared:${getClientIp(req)}`, 60, 60_000)) {
    return NextResponse.json({ error: 'Muitas alterações seguidas. Aguarde um pouco.' }, { status: 429 });
  }
  const parsed = await validateBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const { by, viewer, change } = parsed.data;
  const who = by || 'Alguém';

  const link = (await adminDb.collection('sharedCarts').doc(token).get()).data();
  if (!link || link.expiresAt.toMillis() < Date.now()) {
    return NextResponse.json({ error: 'Esse link expirou ou foi desligado.' }, { status: 410 });
  }
  const cartRef = adminDb.collection('carts').doc(link.uid);
  try {
    const result = await adminDb.runTransaction(async tx => {
      const cart = (await tx.get(cartRef)).data();
      if (cart?.share?.token !== token) return { error: 'Esse link expirou ou foi desligado.' };
      const share = cart.share;
      if (share.paidAt) return { error: 'Esse pedido já foi finalizado.' };
      const now = Date.now();
      // Online: quem mandou sinal nos últimos minutos (os antigos saem).
      const viewers = Object.fromEntries(Object.entries((share.viewers ?? {}) as Record<string, { at: number }>)
        .filter(([, v]) => now - v.at < VIEWER_TTL_MS));
      if (viewer) viewers[viewer] = { name: who, at: now } as { at: number };
      if (change.op === 'ping') {
        tx.update(cartRef, { 'share.viewers': viewers });
        return { ok: true };
      }
      if (change.op === 'msg') {
        const msg = { by: who, text: change.text, at: now };
        tx.update(cartRef, { 'share.chat': [...((share.chat ?? []) as unknown[]), msg].slice(-CHAT_MAX), 'share.viewers': viewers });
        return { ok: true };
      }
      const r = await applySharedOp(adminDb, (cart.items ?? []) as CartItem[], change as SharedOp);
      if ('error' in r) return r;
      // Quem pôs cada produto (por SKU, que não muda ao trocar a fronha).
      const skus = new Set(r.items.map(i => i.sku));
      const addedBy = Object.fromEntries(Object.entries((share.addedBy ?? {}) as Record<string, string>).filter(([k]) => skus.has(k)));
      if (change.op === 'add') {
        const sku = `${change.productId}_${change.variantId}`;
        if (!addedBy[sku]) addedBy[sku] = who;
      }
      const entry = { by: who, text: r.text, at: now };
      tx.update(cartRef, {
        items: r.items,
        updatedAt: new Date().toISOString(),
        'share.lastEdit': entry,
        'share.log': [...((share.log ?? []) as unknown[]), entry].slice(-LOG_MAX),
        'share.addedBy': addedBy,
        'share.viewers': viewers,
      });
      return { ok: true };
    });
    if ('error' in result) return NextResponse.json(result, { status: 409 });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Não deu para salvar. Tente de novo.' }, { status: 500 });
  }
}
