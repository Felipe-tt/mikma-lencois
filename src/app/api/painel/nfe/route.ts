export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth } from '@/lib/firebase/admin';
import { extractBearer, validateBody } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { saveFocusToken, tokenStatus } from '@/lib/nfe/tokens';
import { focusGet, FocusConfigError } from '@/lib/nfe/focusApi';

/**
 * Tokens da Focus NFe (só admin). GET: quais ambientes têm token.
 * POST save: grava (ou apaga, com token vazio). POST test: confere o token.
 * O token nunca volta para o navegador.
 */
async function admin(req: NextRequest): Promise<{ uid: string } | NextResponse> {
  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    if ((decoded as { role?: string }).role !== 'admin') return NextResponse.json({ error: 'Só administradores' }, { status: 403 });
    return { uid: decoded.uid };
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }
}

export async function GET(req: NextRequest) {
  const who = await admin(req);
  if (who instanceof NextResponse) return who;
  return NextResponse.json(await tokenStatus());
}

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), environment: z.enum(['producao', 'homologacao']), token: z.string().trim().max(200) }),
  z.object({ action: z.literal('test'), environment: z.enum(['producao', 'homologacao']) }),
]);

export async function POST(req: NextRequest) {
  const who = await admin(req);
  if (who instanceof NextResponse) return who;
  if (!await rateLimit(`nfe-config:${who.uid}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco.' }, { status: 429 });
  }
  const parsed = await validateBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  if (body.action === 'save') {
    if (body.token && !/^[A-Za-z0-9_-]{10,200}$/.test(body.token)) {
      return NextResponse.json({ error: 'Token com formato inesperado. Copie de novo no painel da Focus.' }, { status: 400 });
    }
    await saveFocusToken(body.environment, body.token || null);
    return NextResponse.json(await tokenStatus());
  }

  // Teste: consulta uma referência que não existe. 404 = token aceito.
  try {
    const res = await focusGet(body.environment, `teste-conexao-${Date.now()}`);
    if (res.status === 404) return NextResponse.json({ ok: true, message: 'Conexão com a Focus NFe funcionando.' });
    if (res.status === 401 || res.status === 403) return NextResponse.json({ ok: false, message: 'A Focus recusou o token deste ambiente.' });
    if (res.status === 0) return NextResponse.json({ ok: false, message: `Sem resposta da Focus (${res.ok ? '' : res.error}).` });
    return NextResponse.json({ ok: res.ok, message: res.ok ? 'Conexão com a Focus NFe funcionando.' : `Resposta inesperada da Focus: ${res.error}` });
  } catch (err) {
    if (err instanceof FocusConfigError) return NextResponse.json({ ok: false, message: err.message });
    throw err;
  }
}
