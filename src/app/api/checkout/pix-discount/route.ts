import { NextResponse, connection } from 'next/server';
import { getSettings } from '@/lib/settings';
import { cardMinCents } from '@/lib/orderPricing';
import { publicCardFees } from '@/lib/gatewayFees';

export async function GET() {
  await connection(); // na hora, não no build (o build não lê o banco)
  try {
    const s = await getSettings();
    // Mínimo e taxa do cartão vão juntos: o checkout faz a mesma conta do servidor.
    return NextResponse.json({
      pixDiscountThresholdCents: s.pixDiscountThresholdCents,
      pixDiscountPct: s.pixDiscountPct,
      cardMinCents: cardMinCents(s.creditMinOrderCents),
      cardFees: publicCardFees(s),
    });
  } catch {
    // fallback para os valores padrão caso algo falhe
    return NextResponse.json({ pixDiscountThresholdCents: 180000, pixDiscountPct: 10, cardMinCents: cardMinCents(), cardFees: publicCardFees(undefined) });
  }
}
