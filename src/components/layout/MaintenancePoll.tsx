'use client';

import { useEffect } from 'react';

/**
 * Substitui os antigos <script> brutos (dangerouslySetInnerHTML) da página
 * /manutencao. Aquele approach tinha um bug sério: o setInterval do polling
 * era registrado direto no `window`, sem qualquer vínculo com o ciclo de
 * vida do React. Quando <MaintenanceAdminRedirect /> tira o admin de
 * /manutencao via router.replace('/painel') — uma navegação client-side do
 * Next.js, sem reload de página — o timer sobrevivia escondido em segundo
 * plano, disparando de novo mais tarde e mandando `window.location.href =
 * '/'`, tirando o admin do painel sem aviso.
 *
 * Como componente React normal, o useEffect + cleanup abaixo garante que o
 * setInterval morre no exato momento em que o Next desmonta esta página
 * (o que já acontece ao navegar pra /painel) — sem sobreviver escondido.
 */
export function MaintenancePoll() {
  useEffect(() => {
    // Polling: assim que a manutenção acabar de verdade (não apenas "esse
    // navegador está liberado"), sai sozinho de /manutencao de volta pra
    // "/", sem precisar que o visitante dê refresh. Checa a cada 20s (antes
    // era 5s — gerava volume alto de invocações de compute sem necessidade
    // real, já que "sair da manutenção" não é uma ação que precisa de
    // reação em tempo real).
    //
    // Importante: `released` no /api/maintenance/status significa "ESSE
    // request específico pode ver o site" (ex: staff logado, IP liberado
    // manualmente) — não "a manutenção acabou pra todo mundo". Um admin
    // sempre chega em `released: true`, mas ele já foi tirado de
    // /manutencao pelo <MaintenanceAdminRedirect />, então esse polling
    // nem chega a rodar de verdade nesse caso (o componente desmonta antes
    // do primeiro tick). Só quem fica esperando aqui de verdade é um
    // visitante comum sem bypass — pra esse caso, `released` também é a
    // condição correta de saída (o IP dele foi liberado da fila).
    let checking = false;
    const id = setInterval(() => {
      if (checking) return;
      checking = true;
      fetch('/api/maintenance/status', { cache: 'no-store' })
        .then(res => res.json())
        .then((data: { active?: boolean; released?: boolean }) => {
          if (!data.active || data.released) window.location.href = '/';
        })
        .catch(() => { /* silencioso, tenta de novo no próximo tick */ })
        .finally(() => { checking = false; });
    }, 20000);

    return () => clearInterval(id);
  }, []);

  return null;
}
