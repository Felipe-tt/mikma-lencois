import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { repriceSite } from '@/lib/repriceSite';

/**
 * POST /api/painel/precos-site
 *
 * Refaz o preço do site de todos os produtos (acréscimo, arredondamento e
 * taxa do PIX salvos nas configurações). Ver lib/repriceSite.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { roles: ['seller', 'admin'] });
  if (!auth.ok) return auth.response;
  if (!await rateLimit(`precos-site:${auth.decoded.uid}`, 5, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde um minuto.' }, { status: 429 });
  }
  const out = await repriceSite();
  return NextResponse.json({ ok: true, ...out });
}
