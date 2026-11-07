import { NextResponse, connection } from 'next/server';
import { googleUrl } from '@/lib/googleProfile';
import { getSettings, getPauseNoticeNow } from '@/lib/settings';

// Expõe apenas campos públicos (sem dados sensíveis de logística/admin)
export async function GET() {
  await connection(); // na hora, não no build (o build não lê o banco)
  try {
    const [s, pausedNotice] = await Promise.all([getSettings(), getPauseNoticeNow()]);
    return NextResponse.json({
      freeShippingThresholdCents: s.freeShippingThresholdCents ?? 0,
      creditMinOrderCents: s.creditMinOrderCents ?? 0,
      storeName: s.storeName,
      storeCity: s.storeCity,
      // Endereço da loja é público (retirada na loja, rodapé).
      storeAddress: s.storeAddress ?? '',
      storeNumber: s.storeNumber ?? '',
      storeNeighborhood: s.storeNeighborhood ?? '',
      storeState: s.storeState ?? '',
      storeCep: s.storeCep ?? '',
      storePhone: s.storePhone,
      storeEmail: s.storeEmail,
      storeCnpj: s.storeCnpj ?? '',
      instagramUrl: s.instagramUrl,
      whatsappUrl: s.whatsappUrl,
      googleReviewUrl: googleUrl(s.googleReviewUrl),
      businessHours: s.businessHours,
      businessHoursTimezone: s.businessHoursTimezone,
      // Vendas pausadas: o carrinho e o checkout mostram o aviso e não deixam pagar.
      salesPausedNotice: pausedNotice,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch {
    return NextResponse.json({}, { status: 500 });
  }
}
