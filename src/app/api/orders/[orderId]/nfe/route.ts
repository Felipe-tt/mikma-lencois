export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer, validateBody } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { cancelNfe, issueNfe, NfeError, nfeField, syncNfe } from '@/lib/nfe/service';
import { FocusConfigError } from '@/lib/nfe/focusApi';

const bodySchema = z.object({
  action: z.enum(['emit', 'sync', 'cancel']),
  environment: z.enum(['producao', 'homologacao']),
  justificativa: z.string().trim().max(255).optional(),
});

/**
 * POST /api/orders/[orderId]/nfe (equipe)
 * emit: emite (ou retoma) a nota; sync: consulta a Focus; cancel: cancela.
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
      ? await issueNfe(orderId, environment, { by: uid, waitMs: 4000 })
      : action === 'sync'
        ? await syncNfe(orderId, environment)
        : await cancelNfe(orderId, environment, justificativa ?? '');
    const nfe = (await adminDb.collection('orders').doc(orderId).get()).get(nfeField(environment)) ?? null;
    return NextResponse.json({ status, nfe });
  } catch (err) {
    if (err instanceof NfeError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    if (err instanceof FocusConfigError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('[nfe route]', err);
    return NextResponse.json({ error: 'Não foi possível falar com o emissor agora. Tente de novo.' }, { status: 502 });
  }
}
