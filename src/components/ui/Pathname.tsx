'use client';
import { Suspense, useLayoutEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/*
 * Prerender parcial (cacheComponents): numa rota com parâmetro dinâmico
 * ([slug], [id]) o caminho só existe na hora do pedido, e ler usePathname
 * fora de um <Suspense> impede o HTML estático da rota. Estes ajudantes
 * isolam a leitura: o HTML estático sai com o caminho vazio e o servidor
 * completa com o caminho certo no mesmo envio.
 */

function Read({ children }: { children: (pathname: string) => ReactNode }) {
  return children(usePathname() ?? '');
}

/** Renderiza com o caminho atual (vazio no HTML estático das rotas dinâmicas). */
export function WithPathname({ children }: { children: (pathname: string) => ReactNode }) {
  return (
    <Suspense fallback={children('')}>
      <Read>{children}</Read>
    </Suspense>
  );
}

function Watch({ onChange }: { onChange: (pathname: string) => void }) {
  const pathname = usePathname() ?? '';
  const prev = useRef(pathname);
  // Layout effect: roda antes da pintura da página nova.
  useLayoutEffect(() => {
    if (prev.current === pathname) return;
    prev.current = pathname;
    onChange(pathname);
  }, [pathname, onChange]);
  return null;
}

/** Chama onChange a cada troca de rota (não na primeira renderização). */
export function OnPathnameChange({ onChange }: { onChange: (pathname: string) => void }) {
  return (
    <Suspense fallback={null}>
      <Watch onChange={onChange} />
    </Suspense>
  );
}
