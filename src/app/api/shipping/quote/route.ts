export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { tooManyRequests, validateBody, getClientIp } from '@/lib/security';
import { getSettings } from '@/lib/settings';
import { computeShippingOptions } from '@/lib/shipping-pricing';
import { getShippingLedgerBalanceCents } from '@/lib/shipping-ledger';
import { z } from 'zod';
import { quoteSchema } from './schema';


// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!await rateLimit(`shipping:ip:${ip}`, 30, 60 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(`shipping:ip:${ip}`));
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);
    const uid = decoded.uid;

    if (!await rateLimit(`shipping:uid:${uid}`, 20, 60 * 60 * 1000)) {
      return tooManyRequests(rateLimitRetryAfter(`shipping:uid:${uid}`));
    }

    const parsedBody = await validateBody(req, quoteSchema);
    if (!parsedBody.ok) return parsedBody.response;
    const { destCep } = parsedBody.data;

    const [settings, cartSnap] = await Promise.all([
      getSettings(),
      adminDb.collection('carts').doc(uid).get(),
    ]);

    if (!cartSnap.exists || !cartSnap.data()?.items?.length) {
      return NextResponse.json({ error: 'Carrinho vazio' }, { status: 400 });
    }

    const cartItems: Array<{ productId: string; quantity: number }> = cartSnap.data()!.items;
    const productIds = Array.from(new Set(cartItems.map(i => i.productId)));
    const productDocs = await Promise.all(productIds.map(id => adminDb.collection('products').doc(id).get()));
    const priceMap: Record<string, number> = {};
    const weightMap: Record<string, number> = {};
    for (const snap of productDocs) {
      if (snap.exists) {
        priceMap[snap.id] = snap.data()!.price as number;
        weightMap[snap.id] = (snap.data()!.weightKg as number | undefined) ?? (settings.defaultItemWeightKg || 0.8);
      }
    }

    const productValueCents = cartItems.reduce((s, i) => s + (priceMap[i.productId] ?? 0) * i.quantity, 0);
    const totalWeightKg = cartItems.reduce((s, i) => s + (weightMap[i.productId] ?? settings.defaultItemWeightKg ?? 0.8) * i.quantity, 0);

    const ledgerBalanceCents = await getShippingLedgerBalanceCents();
    const result = await computeShippingOptions(destCep, settings, productValueCents, totalWeightKg, ledgerBalanceCents);

    return NextResponse.json({
      // realPriceCents é informação interna (custo real de despacho) —
      // nunca deve ir pro cliente, só é usado server-side pro caixa de frete.
      options: result.options.map(({ realPriceCents: _realPriceCents, ...o }) => o),
      distKm: Math.round(result.distKm),
      isLocal: result.isLocal,
      freeShipping: result.freeShipping,
      // Diagnóstico temporário: só exposto pra seller/admin, nunca pro
      // comprador final. Motivo exato de o Uber Direct ter sido omitido
      // da lista (undefined = não se aplicava ou funcionou normalmente).
      ...(result.uberDebug && (decoded.role === 'seller' || decoded.role === 'admin')
        ? { uberDebug: result.uberDebug, uberSandbox: result.uberSandbox }
        : {}),
    });
  } catch (err) {
    console.error('shipping/quote error:', err);
    return NextResponse.json({ error: 'Erro ao calcular frete' }, { status: 500 });
  }
}
