export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer, validateBody } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { cancelNfe, inutilizeNfe, issueNfe, NfeError, nfeField, syncNfe } from '@/lib/nfe/service';

const bodySchema = z.object({
  action: z.enum(['emit', 'sync', 'cancel', 'inutilizar']),
  environment: z.enum(['producao', 'homologacao']),
  justificativa: z.string().trim().max(255).optional(),
});

/**
 * POST /api/orders/[orderId]/nfe (equipe)
 * emit: emite (ou retoma) a nota; sync: consulta a SEFAZ; cancel: cancela;
 * inutilizar: inutiliza o número de uma nota rejeitada.
 * environment "homologacao" é a nota de teste, sem valor fiscal.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;
  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    const role = (decoded as { role?: string }).role ?? '';
    if (role !== 'seller' && role !== 'admin') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }
  if (!await rateLimit(`nfe:${uid}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco.' }, { status: 429 });
  }
  const parsed = await validateBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { action, environment, justificativa } = parsed.data;

  try {
    const status = action === 'emit'
      ? await issueNfe(orderId, environment, { by: uid })
      : action === 'sync'
        ? await syncNfe(orderId, environment)
        : action === 'cancel'
          ? await cancelNfe(orderId, environment, justificativa ?? '')
          : await inutilizeNfe(orderId, environment);
    const nfe = (await adminDb.collection('orders').doc(orderId).get()).get(nfeField(environment)) ?? null;
    return NextResponse.json({ status, nfe });
  } catch (err) {
    if (err instanceof NfeError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    console.error('[nfe route]', err);
    return NextResponse.json({ error: 'Não foi possível falar com a SEFAZ agora. Tente de novo em instantes.' }, { status: 502 });
  }
}
