export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { extractBearer } from '@/lib/security';
import { getShippingLedger } from '@/lib/shipping-ledger';

export async function GET(req: NextRequest) {
  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;

  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    const role = decoded.role as string | undefined;
    if (role !== 'seller' && role !== 'admin') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }

  const ledger = await getShippingLedger();
  return NextResponse.json(ledger);
}
