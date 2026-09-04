import { useEffect, useState } from 'react';

/**
 * Trava o scroll do body e calcula a altura real da viewport visível
 * (via window.visualViewport quando disponível), pra usar em overlays de
 * tela cheia no mobile.
 *
 * Por quê: CSS puro (`h-[100dvh]`) não é suficiente em alguns
 * Chrome/WebView Android — durante a transição de mostrar/esconder a
 * barra de endereço, o valor de `dvh` não acompanha em tempo real,
 * deixando uma fresta no topo/rodapé por onde a página por trás (ex.:
 * uma foto já cadastrada, com fundo colorido e nada esmaecendo ela)
 * aparece por cima do overlay. `visualViewport` é atualizado a cada
 * frame da transição, então o valor em px sempre bate com o que está
 * realmente visível na tela.
 *
 * Retorna a altura em px (ou null antes do primeiro cálculo/em SSR, ou
 * quando `enabled` é false — nesse caso o chamador deve cair pro CSS
 * `h-[100dvh]` como fallback, ou nem se aplicar, ex.: modo embedded de
 * um componente que também tem um modo de tela cheia).
 */
export function useFullscreenOverlay(enabled: boolean = true): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) { setHeight(null); return; }

    const prevOverflow = document.body.style.overflow;
    const prevPosition = document.body.style.position;
    const prevWidth = document.body.style.width;
    const scrollY = window.scrollY;

    // position:fixed no body é o jeito mais confiável de impedir o
    // "rubber-band scroll" do iOS/Android de revelar conteúdo por trás
    // do overlay — overflow:hidden sozinho não segura esse gesto.
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.top = `-${scrollY}px`;

    function update() {
      const vv = window.visualViewport;
      setHeight(vv ? vv.height : window.innerHeight);
    }
    update();

    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.position = prevPosition;
      document.body.style.width = prevWidth;
      document.body.style.top = '';
      window.scrollTo(0, scrollY);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return height;
}
