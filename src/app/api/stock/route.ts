import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getClientIp } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';

const SKU = /^[A-Za-z0-9_-]{1,120}$/;

/**
 * GET /api/stock?skus=a,b,c → { a: 3, b: 0 }
 *
 * Disponível (quantidade - reservado) por SKU, para o carrinho. O documento
 * de estoque tem o histórico de movimentações (vendas da loja física, nomes
 * da equipe), então deixou de ser público: aqui sai só o número.
 */
export async function GET(req: NextRequest) {
  if (!await rateLimit(`stock:${getClientIp(req)}`, 60, 60_000)) {
    return NextResponse.json({ error: 'Muitas consultas. Aguarde um pouco.' }, { status: 429 });
  }
  const skus = [...new Set((req.nextUrl.searchParams.get('skus') ?? '').split(',').map(s => s.trim()).filter(s => SKU.test(s)))].slice(0, 30);
  if (!skus.length) return NextResponse.json({});

  const snaps = await adminDb.getAll(...skus.map(sku => adminDb.collection('inventory').doc(sku)));
  const out: Record<string, number> = {};
  snaps.forEach((snap, i) => {
    const inv = snap.data();
    // Sem documento de estoque: mesmo comportamento de antes (não limita).
    out[skus[i]] = inv ? Math.max(0, (inv.quantity ?? 0) - (inv.reserved ?? 0)) : 99;
  });
  return NextResponse.json(out, { headers: { 'Cache-Control': 'private, max-age=10' } });
}
