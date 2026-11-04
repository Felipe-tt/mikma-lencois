import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { extractBearer } from '@/lib/security';
import { recomputeShippingLedger } from '@/lib/shipping-ledger';
import { effectiveRole } from '@/lib/staffMfa';

// Refaz o saldo a partir dos pedidos a cada leitura: pedido apagado (pelo
// painel ou direto no banco) deixa de contar sem depender de quem apagou.
export async function GET(req: NextRequest) {
  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;

  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    const role = effectiveRole(decoded);
    if (role !== 'seller' && role !== 'admin') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }

  const ledger = await recomputeShippingLedger();
  return NextResponse.json(ledger);
}
