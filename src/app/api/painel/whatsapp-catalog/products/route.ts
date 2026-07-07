export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, safeJson, tooManyRequests } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { connectAndWait, buildJid, normalizeProduct } from '@/lib/whatsapp/catalogClient';
import { getSettings } from '@/lib/settings';

interface Body {
  number?: string;
  cursor?: string;
  limit?: number;
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { roles: ['seller', 'admin'] });
  if (!auth.ok) return auth.response;

  const key = `whatsapp-catalog:products:${auth.decoded.uid}`;
  if (!rateLimit(key, 60, 60 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(key));
  }

  const body = await safeJson<Body>(req, 2048);
  if (!body.ok) return body.response;

  const settings = await getSettings();
  const number = (body.data.number || settings.storePhone || '').trim();
  if (!number.replace(/\D/g, '')) {
    return NextResponse.json(
      { error: 'Nenhum número de WhatsApp configurado. Informe um número ou cadastre em Configurações.' },
      { status: 400 }
    );
  }

  const limit = Math.min(Math.max(body.data.limit ?? 24, 1), 50);
  const jid = buildJid(number);

  let sock;
  try {
    // Sessão já deve existir (passo "Conectar" feito antes) — por isso o
    // timeout aqui é curto: se precisar de QR de novo, é melhor avisar o
    // lojista a voltar pro passo de conexão do que ele ficar esperando.
    sock = await connectAndWait(20_000);
  } catch (err) {
    const reason = (err as { reason?: string })?.reason;
    return NextResponse.json(
      {
        error:
          reason === 'logged_out'
            ? 'A sessão do WhatsApp foi desconectada. Conecte novamente antes de buscar os produtos.'
            : 'Não foi possível usar a conexão com o WhatsApp agora. Volte ao passo "Conectar" e tente de novo.',
      },
      { status: 409 }
    );
  }

  try {
    const result = await sock.getCatalog({ jid, limit, cursor: body.data.cursor });
    const products = (result?.products ?? []).map((p, i) => normalizeProduct(p, i));
    return NextResponse.json({
      products,
      nextCursor: result?.nextPageCursor || null,
    });
  } catch (err) {
    // Loga o erro real — sem isso, a causa de "não consegue buscar o
    // catálogo" fica invisível, só aparece um genérico pro lojista.
    console.error(`[whatsapp-catalog] getCatalog falhou pra jid=${jid}:`, err);
    // status 200 (não 5xx) de propósito: alguns proxies/CDNs na frente
    // do Cloud Run interceptam respostas 5xx e substituem por uma
    // página de erro genérica, escondendo esta mensagem JSON do
    // cliente — o mesmo motivo pelo qual /connect já usa 200 em erro.
    return NextResponse.json(
      {
        error: 'Não foi possível buscar o catálogo nesse número. Confira se o número está certo e se o catálogo está público.',
      },
      { status: 200 }
    );
  } finally {
    try {
      sock.end(undefined);
    } catch {
      /* ignora */
    }
  }
}
