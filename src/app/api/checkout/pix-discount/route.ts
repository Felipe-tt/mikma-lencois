import { NextResponse, connection } from 'next/server';
import { getSettings } from '@/lib/settings';
import { cardMinCents } from '@/lib/orderPricing';

export async function GET() {
  await connection(); // na hora, não no build (o build não lê o banco)
  try {
    const { pixDiscountThresholdCents, pixDiscountPct, creditMinOrderCents } = await getSettings();
    // Mínimo do cartão vai junto: o checkout precisa da mesma regra do servidor.
    return NextResponse.json({ pixDiscountThresholdCents, pixDiscountPct, cardMinCents: cardMinCents(creditMinOrderCents) });
  } catch {
    // fallback para os valores padrão caso algo falhe
    return NextResponse.json({ pixDiscountThresholdCents: 180000, pixDiscountPct: 10, cardMinCents: cardMinCents() });
  }
}
