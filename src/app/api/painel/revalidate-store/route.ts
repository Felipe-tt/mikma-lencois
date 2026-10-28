import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { verifyAuth, getClientIp } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { revalidateProduct } from '@/lib/revalidateProduct';

/**
 * Revalida as páginas públicas da loja (ISR) depois de uma mudança de
 * configuração/aparência salva pelo painel.
 *
 * Sem isso, mudanças salvas direto no Firestore pelo client SDK (sem
 * passar por uma rota de API) nunca disparam a regeneração das páginas
 * estáticas, o site continua servindo a versão antiga até o intervalo
 * de revalidate de cada página expirar sozinho (15min na home, até 24h
 * em /sobre, /termos, /privacidade). Pro admin, isso parecia "a
 * mudança nunca aparece no site".
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { roles: ['seller', 'admin'] });
  if (!auth.ok) return auth.response;

  const ip = getClientIp(req);
  const key = `revalidate:${auth.decoded.uid}`;
  if (!await rateLimit(key, 15, 60_000) || !await rateLimit(`revalidate-ip:${ip}`, 30, 60_000)) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Aguarde um pouco.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimitRetryAfter(key) / 1000)) } }
    );
  }

  // Com { productId }: só as páginas que mostram aquele produto (o
  // formulário de produto do painel grava direto no Firestore).
  const body = await req.json().catch(() => null) as { productId?: unknown } | null;
  if (typeof body?.productId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(body.productId)) {
    revalidateProduct(body.productId);
    return NextResponse.json({ ok: true });
  }

  // 'layout' revalida a rota e tudo abaixo dela, cobre páginas dinâmicas
  // (ex: /produtos/[slug]) sem precisar listar cada uma individualmente.
  revalidatePath('/', 'layout');
  revalidateTag('settings', { expire: 0 });
  revalidateTag('products', { expire: 0 });

  return NextResponse.json({ ok: true });
}
