import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getClientIp } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { checkDocToken, nfeField } from '@/lib/nfe/service';
import { danfePdf } from '@/lib/nfe/sefaz';
import type { NfeRecord } from '@/lib/nfe/types';

/**
 * GET /api/nfe/documento?o=<pedido>&e=producao|homologacao&t=<assinatura>&tipo=danfe|xml
 * DANFE (PDF) ou XML da nota autorizada. Link assinado: o cliente abre pelo
 * pedido ou pelo e-mail sem precisar de login.
 */
export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  if (!await rateLimit(`nfe-doc:${ip}`, 30, 60_000)) return NextResponse.json({ error: 'Muitas tentativas' }, { status: 429 });
  const q = req.nextUrl.searchParams;
  const orderId = q.get('o') ?? '';
  const env = q.get('e') === 'homologacao' ? 'homologacao' : 'producao';
  const tipo = q.get('tipo') === 'xml' ? 'xml' : 'danfe';
  if (!/^[\w-]{1,80}$/.test(orderId) || !checkDocToken(orderId, env, q.get('t') ?? '')) {
    return NextResponse.json({ error: 'Link inválido' }, { status: 404 });
  }
  const order = await adminDb.collection('orders').doc(orderId).get();
  const rec = order.get(nfeField(env)) as NfeRecord | undefined;
  if (!rec?.chave || (rec.status !== 'autorizada' && rec.status !== 'cancelada')) {
    return NextResponse.json({ error: 'Nota não encontrada' }, { status: 404 });
  }
  const doc = (await order.ref.collection('nfeDocs').doc(rec.chave).get()).data();
  if (!doc) return NextResponse.json({ error: 'Nota não encontrada' }, { status: 404 });
  const fileName = `NFe${rec.chave}`;

  if (tipo === 'xml') {
    if (!doc.xml) return NextResponse.json({ error: 'XML não disponível. Baixe pelo portal nacional da NF-e com a chave de acesso.' }, { status: 404 });
    return new Response(doc.xml as string, {
      headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': `attachment; filename="${fileName}.xml"`, 'Cache-Control': 'private, no-store' },
    });
  }

  // Com o XML autorizado, a DANFE sai dele; senão, da nota enviada + protocolo.
  const source = doc.xml
    ? (doc.xml as string)
    : { NFe: JSON.parse(doc.nfe as string).NFe, ...(doc.protNFe ? { protNFe: JSON.parse(doc.protNFe as string) } : {}) };
  const pdf = await danfePdf(source, rec.chave);
  return new Response(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${fileName}.pdf"`, 'Cache-Control': 'private, no-store' },
  });
}
