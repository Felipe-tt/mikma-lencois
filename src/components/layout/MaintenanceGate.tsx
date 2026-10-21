'use client';

import { useEffect } from 'react';

/**
 * Fallback client-side para o middleware.
 *
 * Páginas públicas usam ISR (revalidate) e o Firebase Hosting pode servir
 * a resposta direto da CDN em cache-hit, nesse caso a requisição nunca
 * chega no Cloud Run, e o middleware.ts (que roda lá) nunca é executado.
 * Resultado: um visitante pode carregar "/" já em manutenção, mas a página
 * estática antiga (pré-manutenção) ainda em cache é servida sem redirect.
 *
 * Esse componente cobre esse buraco: assim que a página carrega no
 * browser, ele confirma via /api/maintenance/status (sempre dinâmico, sem
 * cache) se a manutenção está ativa e se esse IP não está liberado, se
 * for o caso, redireciona pra /manutencao mesmo que o HTML cacheado
 * tenha sido servido normalmente.
 */
export function MaintenanceGate() {
  useEffect(() => {
    let cancelled = false;

    fetch('/api/maintenance/status', { cache: 'no-store' })
      // Só uma resposta OK manda pra manutenção: erro ou limite (429) não
      // muda de página (o proxy já barra quem não pode ver).
      .then((res) => (res.ok ? res.json() : {}))
      .then((data: { active?: boolean; released?: boolean }) => {
        if (cancelled) return;
        if (data.active && !data.released) {
          // Leva o caminho junto, como o proxy: staff logado volta pra ele.
          const de = window.location.pathname;
          window.location.href = de && de !== '/' ? `/manutencao?de=${encodeURIComponent(de)}` : '/manutencao';
        }
      })
      .catch(() => {
        /* silencioso, se a checagem falhar, não bloqueia a navegação */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
