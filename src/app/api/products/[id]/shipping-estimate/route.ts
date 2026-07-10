export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getClientIp } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { tooManyRequests } from '@/lib/security';
import { getSettings } from '@/lib/settings';
import { computeShippingOptions } from '@/lib/shipping-pricing';
import { getShippingLedgerBalanceCents } from '@/lib/shipping-ledger';

interface Params { params: Promise<{ id: string }> }

// Estimativa de frete pública (sem login) pra um único produto — usada pelo
// "Calcule o frete" na página de produto, no mesmo espírito do Amazon/Mercado
// Livre, que cotam frete antes de qualquer login ou item no carrinho.
// Reaproveita a mesma computeShippingOptions do checkout: nunca duplica a
// lógica de preço de frete.
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ip = getClientIp(req);

  if (!rateLimit(`shipping-estimate:${ip}`, 20, 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(`shipping-estimate:${ip}`));
  }

  try {
    const { destCep, qty } = await req.json();
    const cleanCep = String(destCep ?? '').replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      return NextResponse.json({ error: 'CEP inválido' }, { status: 400 });
    }
    const quantity = Math.max(1, Math.min(99, Number(qty) || 1));

    const productSnap = await adminDb.collection('products').doc(id).get();
    if (!productSnap.exists || !productSnap.data()?.active) {
      return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });
    }
    const product = productSnap.data()!;
    const settings = await getSettings();

    const ledgerBalanceCents = await getShippingLedgerBalanceCents();
    const result = await computeShippingOptions(
      cleanCep,
      settings,
      product.price * quantity,
      (product.weightKg || 0.5) * quantity,
      ledgerBalanceCents,
    );

    return NextResponse.json({
      // realPriceCents nunca vai pro cliente — só usado internamente.
      options: result.options.filter(o => o.available).map(({ realPriceCents: _realPriceCents, ...o }) => o),
      isLocal: result.isLocal,
      freeShipping: result.freeShipping,
    });
  } catch (err) {
    console.error('shipping-estimate error:', err);
    return NextResponse.json({ error: 'Não foi possível calcular o frete agora' }, { status: 500 });
  }
}
