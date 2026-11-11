import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth } from '@/lib/firebase/admin';
import { extractBearer, validateBody } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { effectiveRole } from '@/lib/staffMfa';
import { getSettings } from '@/lib/settings';
import { nfeConfigFrom } from '@/lib/nfe/config';
import { issueNfeDevolucao, NfeError } from '@/lib/nfe/service';

/**
 * POST /api/orders/[orderId]/nfe-devolucao (equipe): emite (ou continua) a
 * nota de devolução de uma troca/devolução concluída, ou do pedido inteiro
 * cancelado depois do prazo de cancelar a nota (devolucao = "cancelamento").
 * No ambiente configurado no painel, salvo se vier outro.
 */
const schema = z.object({
  devolucao: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  environment: z.enum(['producao', 'homologacao']).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
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
  if (!await rateLimit(`nfe-dev:${uid}`, 10, 60_000)) return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco.' }, { status: 429 });
  const parsed = await validateBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const env = parsed.data.environment ?? nfeConfigFrom(await getSettings() as unknown as Record<string, unknown>).environment;
  try {
    const status = await issueNfeDevolucao(orderId, parsed.data.devolucao, env, { by: uid });
    return NextResponse.json({ status, environment: env });
  } catch (err) {
    if (err instanceof NfeError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    console.error('[nfe-devolucao]', err);
    return NextResponse.json({ error: 'Não foi possível falar com a SEFAZ agora. Tente de novo.' }, { status: 502 });
  }
}
