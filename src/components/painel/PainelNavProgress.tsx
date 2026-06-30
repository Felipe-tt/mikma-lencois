'use client';
import { createContext, useContext, useEffect, useRef, useState, useTransition } from 'react';

type NavProgressCtx = {
  /** Inicia a barra e executa `action` dentro de uma transição React. */
  navigate: (action: () => void) => void;
  isPending: boolean;
};

const Ctx = createContext<NavProgressCtx | null>(null);

export function usePainelNav() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePainelNav precisa estar dentro de <PainelNavProgressProvider>');
  return ctx;
}

/**
 * Provider + barra de progresso fixa no topo do painel.
 *
 * Por quê: as páginas do painel são client components que buscam dados via
 * onSnapshot (Firestore) — o loading.tsx do Next só cobre o carregamento do
 * componente da rota, não esse fetch, então em navegações internas (já com o
 * JS em cache) a troca de página acontecia sem nenhum feedback visual,
 * dando a sensação de tela congelada. A barra aqui é acesa no exato
 * instante do clique (via startTransition) e só apaga quando a transição
 * termina, então funciona independente de qual página chamou onSnapshot.
 */
export function PainelNavProgressProvider({ children }: { children: React.ReactNode }) {
  const [isPending, startTransition] = useTransition();
  const [visible, setVisible] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isPending) {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
      setVisible(true);
    } else if (visible) {
      // Deixa a barra completar a animação até 100% antes de desaparecer.
      hideTimeout.current = setTimeout(() => setVisible(false), 200);
    }
    return () => { if (hideTimeout.current) clearTimeout(hideTimeout.current); };
  }, [isPending, visible]);

  function navigate(action: () => void) {
    startTransition(action);
  }

  return (
    <Ctx.Provider value={{ navigate, isPending }}>
      {visible && (
        <div className="fixed top-0 left-0 right-0 z-[100] h-[3px] bg-transparent pointer-events-none" aria-hidden>
          <div
            key={isPending ? 'running' : 'done'}
            className="h-full bg-[#C4714A]"
            style={{
              animation: isPending
                ? 'progress-bar 8s ease-out forwards'
                : 'progress-bar-finish 200ms ease-out forwards',
            }}
          />
        </div>
      )}
      {children}
    </Ctx.Provider>
  );
}
