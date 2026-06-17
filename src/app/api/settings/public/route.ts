export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/settings';

// Expõe apenas campos públicos (sem dados sensíveis de logística/admin)
export async function GET() {
  try {
    const s = await getSettings();
    return NextResponse.json({
      freeShippingThresholdCents: s.freeShippingThresholdCents ?? 0,
      storeName: s.storeName,
      storeCity: s.storeCity,
      storePhone: s.storePhone,
      storeEmail: s.storeEmail,
      instagramUrl: s.instagramUrl,
      whatsappUrl: s.whatsappUrl,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch {
    return NextResponse.json({}, { status: 500 });
  }
}
