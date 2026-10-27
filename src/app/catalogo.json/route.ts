import { NextResponse } from 'next/server';
import { getAgentCatalog, SITE_URL } from '@/lib/agentCatalog';
import { getSettings } from '@/lib/settings';

export const revalidate = 600;

/**
 * Catálogo em JSON para assistentes de compra e buscadores: produtos,
 * variações com disponibilidade, preços e as regras de pagamento e entrega.
 * A compra em si continua sendo pelo site.
 */
export async function GET() {
  const [products, s] = await Promise.all([getAgentCatalog(), getSettings()]);
  return NextResponse.json({
    store: {
      name: 'Mikma Lençóis',
      url: SITE_URL,
      currency: 'BRL',
      country: 'BR',
      location: 'Blumenau, SC',
      material: 'Todos os produtos são de malha 100% algodão.',
      payment: {
        methods: ['pix', 'credit_card'],
        ...(s.pixDiscountThresholdCents > 0 && s.pixDiscountPct > 0
          ? { pixDiscount: { percent: s.pixDiscountPct, minProductsCents: s.pixDiscountThresholdCents } }
          : {}),
      },
      policies: {
        returns: `${SITE_URL}/trocas-e-devolucoes`,
        returnDays: 7,
        sizeGuide: `${SITE_URL}/guia-de-tamanhos`,
        privacy: `${SITE_URL}/privacidade`,
      },
    },
    products: products.map(p => ({ ...p, price: { amountCents: p.priceCents, currency: 'BRL' }, priceCents: undefined })),
  }, { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=600' } });
}
