'use client';
import { usePathname } from 'next/navigation';
import { useLayoutEffect, useRef } from 'react';

// Entrada suave a cada troca de rota. Usa a Web Animations API em vez de
// classe fixa com translate: qualquer transform que fica aplicado no
// wrapper vira o "containing block" dos elementos position: fixed da
// página (a barra de compra do celular, por exemplo, ia parar no fim do
// conteúdo em vez de ficar presa na tela). Aqui o transform só existe
// durante os 280ms da animação e some quando ela termina.
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const prevPath = useRef(pathname);

  // Layout effect: roda antes da pintura, então a página nova nunca aparece
  // por um frame e depois some pra animar.
  useLayoutEffect(() => {
    if (prevPath.current === pathname) return;
    prevPath.current = pathname;
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const anim = el.animate(
      [
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 280, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
    );
    return () => anim.cancel();
  }, [pathname]);

  return <div ref={ref}>{children}</div>;
}
