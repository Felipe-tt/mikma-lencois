export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { getClientIp, validateBody } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { applySharedOp, TOKEN_RE, type SharedOp } from '@/lib/sharedCart';
import type { CartItem } from '@/types';

const id = z.string().min(1).max(120);
const schema = z.object({
  by: z.string().trim().max(24).optional(),
  change: z.discriminatedUnion('op', [
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
  const { by, change } = parsed.data;

  const link = (await adminDb.collection('sharedCarts').doc(token).get()).data();
  if (!link || link.expiresAt.toMillis() < Date.now()) {
    return NextResponse.json({ error: 'Esse link expirou ou foi desligado.' }, { status: 410 });
  }
  const cartRef = adminDb.collection('carts').doc(link.uid);
  try {
    const result = await adminDb.runTransaction(async tx => {
      const cart = (await tx.get(cartRef)).data();
      if (cart?.share?.token !== token) return { error: 'Esse link expirou ou foi desligado.' };
      const r = await applySharedOp(adminDb, (cart.items ?? []) as CartItem[], change as SharedOp);
      if ('error' in r) return r;
      tx.update(cartRef, {
        items: r.items,
        updatedAt: new Date().toISOString(),
        'share.lastEdit': { by: by || 'Alguém', text: r.text, at: Date.now() },
      });
      return { ok: true };
    });
    if ('error' in result) return NextResponse.json(result, { status: 409 });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Não deu para salvar. Tente de novo.' }, { status: 500 });
  }
}
