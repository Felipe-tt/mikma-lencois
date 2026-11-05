import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyAuth } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { normalizeRule } from '@/lib/sitePrice';

/**
 * GET /api/painel/preco/[id]: de onde vem o preço do site, só para a
 * equipe (o preço da loja física não vai no HTML da loja). Leitura apenas.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Só lê: vale na loja mesmo sem a segunda etapa do painel nesta sessão.
  const auth = await verifyAuth(req, { roles: ['seller', 'admin'], allowWithoutSecondFactor: true });
  if (!auth.ok) return auth.response;
  if (!await rateLimit(`preco-detalhe:${auth.decoded.uid}`, 120, 60_000)) {
    return NextResponse.json({ error: 'Muitas consultas. Aguarde um pouco.' }, { status: 429 });
  }
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return NextResponse.json({ error: 'Produto inválido' }, { status: 400 });

  const [prod, settings] = await Promise.all([
    adminDb.collection('products').doc(id).get(),
    adminDb.collection('settings').doc('store').get(),
  ]);
  if (!prod.exists) return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });
  const d = prod.data()!;
  const s = settings.data() ?? {};
  const rule = normalizeRule({ pct: s.sitePriceMarkupPct, rounding: s.sitePriceRounding });
  return NextResponse.json(
    {
      price: Number(d.price) || 0,
      storePrice: typeof d.storePrice === 'number' && d.storePrice > 0 ? d.storePrice : null,
      pct: rule.pct,
      rounding: rule.rounding,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
