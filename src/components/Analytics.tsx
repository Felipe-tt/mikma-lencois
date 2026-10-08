'use client';
import { Suspense, useEffect, useRef } from 'react';
import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { GA_ID, META_PIXEL_ID, trackPageView } from '@/lib/analytics';
import { useCookieConsent } from '@/lib/cookie-consent';

/**
 * Dispara um page_view a cada troca de rota. Necessário porque o App
 * Router navega sem recarregar a página (SPA), então o gtag.js/fbq só
 * pegam o carregamento inicial sozinhos — sem isso, cada navegação
 * interna (clicar num produto, ir pro carrinho etc.) ficaria invisível
 * no Analytics.
 */
function RouteChangeTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const firstRender = useRef(true);

  useEffect(() => {
    // A primeira renderização já é coberta pelo carregamento inicial do
    // gtag.js/fbq (que dispara o page_view sozinho); só rastreia manual
    // a partir da segunda navegação, senão duplicaria a primeira visita.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const query = searchParams.toString();
    trackPageView(pathname + (query ? `?${query}` : ''));
  }, [pathname, searchParams]);

  return null;
}

export function Analytics() {
  // Nada de terceiros (GA/Pixel) é carregado antes do aceite no aviso de
  // cookies. Recusou ou ainda não escolheu: nenhum script, nenhum cookie.
  const consent = useCookieConsent();
  if (consent !== 'granted') return null;
  if (!GA_ID && !META_PIXEL_ID) return null;

  return (
    <>
      {GA_ID && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_ID}');
            `}
          </Script>
        </>
      )}

      {META_PIXEL_ID && (
        <>
          <Script id="meta-pixel-init" strategy="afterInteractive">
            {`
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${META_PIXEL_ID}');
              fbq('track', 'PageView');
            `}
          </Script>
        </>
      )}

      <Suspense fallback={null}>
        <RouteChangeTracker />
      </Suspense>
    </>
  );
}
