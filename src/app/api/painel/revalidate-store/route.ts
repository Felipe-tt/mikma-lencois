export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { verifyAuth } from '@/lib/security';

/**
 * Revalida as páginas públicas da loja (ISR) depois de uma mudança de
 * configuração/aparência salva pelo painel.
 *
 * Sem isso, mudanças salvas direto no Firestore pelo client SDK (sem
 * passar por uma rota de API) nunca disparam a regeneração das páginas
 * estáticas — o site continua servindo a versão antiga até o intervalo
 * de revalidate de cada página expirar sozinho (15min na home, até 24h
 * em /sobre, /termos, /privacidade). Pro admin, isso parecia "a
 * mudança nunca aparece no site".
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { roles: ['seller', 'admin'] });
  if (!auth.ok) return auth.response;

  // 'layout' revalida a rota e tudo abaixo dela — cobre páginas dinâmicas
  // (ex: /produtos/[slug]) sem precisar listar cada uma individualmente.
  revalidatePath('/', 'layout');

  return NextResponse.json({ ok: true });
}
