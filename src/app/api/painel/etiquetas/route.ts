import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth } from '@/lib/firebase/admin';
import { extractBearer, validateBody } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { effectiveRole } from '@/lib/staffMfa';
import { CorreiosError, labelPdf } from '@/lib/correiosPrepostagem';
import { generateLabel, loadOrder } from '@/lib/correiosEtiqueta';

/**
 * Etiquetas dos Correios em lote, para a lista de pedidos (equipe).
 * POST { orderIds, coleta }: gera a etiqueta de cada pedido em separação que
 *   ainda não tem (e pede a coleta). Um pedido com problema não trava os
 *   outros: a resposta diz o resultado de cada um.
 * GET ?pedidos=a,b,c: um PDF só com as etiquetas desses pedidos.
 */
const MAX = 30;

async function staff(req: NextRequest): Promise<{ uid: string } | NextResponse> {
  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    const role = effectiveRole(decoded);
    if (role !== 'seller' && role !== 'admin') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    return { uid: decoded.uid };
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }
}

const orderId = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const postSchema = z.object({ orderIds: z.array(orderId).min(1).max(MAX), coleta: z.boolean().default(true) });

export async function POST(req: NextRequest) {
  const who = await staff(req);
  if (who instanceof NextResponse) return who;
  if (!await rateLimit(`etiquetas-lote:${who.uid}`, 6, 60_000)) return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco.' }, { status: 429 });
  const parsed = await validateBody(req, postSchema);
  if (!parsed.ok) return parsed.response;

  const results: Array<{ orderId: string; codigoObjeto?: string; error?: string }> = [];
  // Um por vez: os Correios limitam chamadas por segundo, e o lote do dia
  // é pequeno.
  for (const id of [...new Set(parsed.data.orderIds)]) {
    try {
      const pre = await generateLabel(id, parsed.data.coleta);
      results.push({ orderId: id, codigoObjeto: pre.codigoObjeto });
    } catch (err) {
      const message = err instanceof CorreiosError ? err.message : 'Não foi possível falar com os Correios.';
      if (!(err instanceof CorreiosError)) console.error(`[etiquetas-lote] pedido ${id}:`, err);
      results.push({ orderId: id, error: message });
    }
  }
  return NextResponse.json({ results });
}

export async function GET(req: NextRequest) {
  const who = await staff(req);
  if (who instanceof NextResponse) return who;
  if (!await rateLimit(`etiquetas-pdf:${who.uid}`, 20, 60_000)) return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco.' }, { status: 429 });
  const ids = [...new Set((req.nextUrl.searchParams.get('pedidos') ?? '').split(',').filter(Boolean))];
  if (!ids.length || ids.length > MAX || !ids.every(i => orderId.safeParse(i).success)) {
    return NextResponse.json({ error: `Informe de 1 a ${MAX} pedidos.` }, { status: 400 });
  }
  const orders = await Promise.all(ids.map(id => loadOrder(id).then(r => r.order)));
  const pre = orders.map(o => o?.delivery?.prePostagem?.id).filter((v): v is string => !!v);
  if (!pre.length) return NextResponse.json({ error: 'Nenhum desses pedidos tem etiqueta.' }, { status: 404 });
  try {
    const pdf = await labelPdf(pre, { tries: 15 });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="etiquetas-${new Date().toISOString().slice(0, 10)}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    if (err instanceof CorreiosError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[etiquetas-pdf]', err);
    return NextResponse.json({ error: 'Não foi possível falar com os Correios agora. Tente de novo.' }, { status: 502 });
  }
}
