import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { extractBearer } from '@/lib/security';
import { effectiveRole } from '@/lib/staffMfa';

// Diz ao painel quais chaves da AbacatePay o servidor tem (só se existem,
// nunca o valor), para o botão de Dev Mode não quebrar o checkout.
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

  return NextResponse.json({
    producao: !!process.env.ABACATEPAY_API_KEY,
    teste: !!process.env.ABACATEPAY_SANDBOX_API_KEY,
  });
}
