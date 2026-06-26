export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/settings';

export async function GET() {
  try {
    const { pixDiscountThresholdCents, pixDiscountPct } = await getSettings();
    return NextResponse.json({ pixDiscountThresholdCents, pixDiscountPct });
  } catch {
    // fallback para os valores padrão caso algo falhe
    return NextResponse.json({ pixDiscountThresholdCents: 180000, pixDiscountPct: 10 });
  }
}
