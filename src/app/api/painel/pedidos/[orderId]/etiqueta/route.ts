import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth } from '@/lib/firebase/admin';
import { extractBearer, validateBody } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { effectiveRole } from '@/lib/staffMfa';
import { cancelPrePostagem, CorreiosError, labelPdf } from '@/lib/correiosPrepostagem';
import { generateLabel, loadOrder } from '@/lib/correiosEtiqueta';

/**
 * Etiqueta dos Correios pelo contrato, direto do painel (equipe).
 * POST { coleta }: cria a pré-postagem (código de rastreio) e, com coleta,
 *   pede para os Correios buscarem na loja. Uma por pedido.
 * GET: PDF da etiqueta para imprimir.
 * DELETE: cancela a pré-postagem (antes de postar), para gerar outra.
 */
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

const fail = (err: unknown) => {
  if (err instanceof CorreiosError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error('[etiqueta]', err);
  return NextResponse.json({ error: 'Não foi possível falar com os Correios agora. Tente de novo.' }, { status: 502 });
};

const postSchema = z.object({ coleta: z.boolean().default(true) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const who = await staff(req);
  if (who instanceof NextResponse) return who;
  if (!await rateLimit(`etiqueta:${who.uid}`, 20, 60_000)) return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco.' }, { status: 429 });
  const parsed = await validateBody(req, postSchema);
  if (!parsed.ok) return parsed.response;
  try {
    return NextResponse.json({ prePostagem: await generateLabel(orderId, parsed.data.coleta) });
  } catch (err) {
    return fail(err);
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const who = await staff(req);
  if (who instanceof NextResponse) return who;
  if (!await rateLimit(`etiqueta-pdf:${who.uid}`, 30, 60_000)) return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco.' }, { status: 429 });
  const { order } = await loadOrder(orderId);
  const pre = order?.delivery?.prePostagem;
  if (!pre) return NextResponse.json({ error: 'Este pedido ainda não tem etiqueta.' }, { status: 404 });
  try {
    const pdf = await labelPdf(pre.id);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="etiqueta-${pre.codigoObjeto}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const who = await staff(req);
  if (who instanceof NextResponse) return who;
  if (!await rateLimit(`etiqueta:${who.uid}`, 20, 60_000)) return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco.' }, { status: 429 });
  const { ref, order } = await loadOrder(orderId);
  const pre = order?.delivery?.prePostagem;
  if (!order || !pre) return NextResponse.json({ error: 'Este pedido não tem etiqueta.' }, { status: 404 });
  if (order.status === 'shipped' || order.status === 'delivered') {
    return NextResponse.json({ error: 'O pedido já foi despachado: a etiqueta não pode mais ser cancelada aqui.' }, { status: 409 });
  }
  try {
    await cancelPrePostagem(pre.id);
    await ref.update({ 'delivery.prePostagem': FieldValue.delete(), updatedAt: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
