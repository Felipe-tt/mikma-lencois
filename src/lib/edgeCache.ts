import type { NextRequest } from 'next/server';
import { STAFF_SESSION_COOKIE } from '@/lib/staffSession';

/**
 * Cache do HTML na Cloudflare (Cloudflare-CDN-Cache-Control só vale para
 * ela; o navegador e o Next não usam). As páginas públicas são iguais para
 * todo mundo: login, carrinho e favoritos vêm do navegador. Não guarda em
 * manutenção (a borda pularia o redirecionamento) nem para staff logado
 * (pode ver o site em manutenção).
 *
 * Os pedidos internos do Next (RSC, prefetch) têm outro conteúdo na mesma
 * URL, mas o Next tira esses headers antes do proxy: quem os exclui do
 * cache é a regra da Cloudflare (workflow infra-manutencao).
 */
export function edgeHtmlCache(req: NextRequest, maintenanceActive: boolean): string {
  if (
    maintenanceActive ||
    (req.method !== 'GET' && req.method !== 'HEAD') ||
    req.cookies.has(STAFF_SESSION_COOKIE)
  ) return 'no-store';
  // 2 min fresco e até 10 min servindo o antigo enquanto busca o novo.
  return 'public, max-age=120, stale-while-revalidate=600';
}
