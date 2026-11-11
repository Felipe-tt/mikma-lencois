import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { effectiveRole } from '@/lib/staffMfa';
import { avisarCliente, avisoDoStatus } from '@/lib/returns/avisarCliente';

/**
 * POST /api/painel/trocas/[returnId]/avisar (equipe): depois de aprovar,
 * recusar, receber no balcão ou concluir a troca no painel, manda o e-mail do status atual
 * para o cliente. Uma vez por status (ver avisarCliente).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ returnId: string }> }) {
  const { returnId } = await params;
  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;
  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    const role = effectiveRole(decoded);
    if (role !== 'seller' && role !== 'admin') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }
  if (!await rateLimit(`troca-aviso:${uid}`, 30, 60_000)) return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco.' }, { status: 429 });

  const snap = await adminDb.collection('returns').doc(returnId).get();
  if (!snap.exists) return NextResponse.json({ error: 'Troca não encontrada' }, { status: 404 });
  const kind = avisoDoStatus({ status: snap.get('status'), recebidaEm: snap.get('recebidaEm') });
  if (!kind) return NextResponse.json({ result: 'nada-a-avisar' });
  const result = await avisarCliente(returnId, kind);
  return NextResponse.json({ result }, { status: result === 'erro' ? 502 : 200 });
}
