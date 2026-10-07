'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  HAS_OPTIONAL_COOKIES,
  OPEN_PREFERENCES_EVENT,
  setConsent,
  useCookieConsent,
} from '@/lib/cookie-consent';

const SHOW_DELAY_MS = 1500;
const EXIT_MS = 250;
// Etapa de conversão: não interrompemos o checkout com avisos.
const HIDDEN_ON = ['/checkout'];

/**
 * Aviso de cookies discreto: cartão pequeno no canto, sem overlay e sem
 * bloquear a navegação. Só aparece se houver cookies opcionais configurados
 * e o visitante ainda não tiver escolhido. "Recusar" e "Aceitar" têm o mesmo
 * peso visual de propósito.
 */
export function CookieBanner() {
  const status = useCookieConsent();
  const pathname = usePathname();

  const [ready, setReady] = useState(false); // atraso inicial, pra não competir com o 1º carregamento
  const [reopened, setReopened] = useState(false); // aberto pelo link "Preferências de cookies"
  const [shown, setShown] = useState(false); // dispara a animação de entrada
  const [leaving, setLeaving] = useState(false); // mantém montado durante a saída

  useEffect(() => {
    const t = setTimeout(() => setReady(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const open = () => setReopened(true);
    window.addEventListener(OPEN_PREFERENCES_EVENT, open);
    return () => window.removeEventListener(OPEN_PREFERENCES_EVENT, open);
  }, []);

  const suppressed = HIDDEN_ON.some(p => pathname?.startsWith(p));
  const wantOpen =
    HAS_OPTIONAL_COOKIES && (reopened || (status === 'unset' && ready && !suppressed));

  // Monta invisível e liga no próximo frame, pra a transição de entrada acontecer.
  useEffect(() => {
    if (!wantOpen) return;
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [wantOpen]);

  function choose(analytics: boolean) {
    setConsent(analytics);
    setReopened(false);
    setShown(false);
    setLeaving(true);
    setTimeout(() => setLeaving(false), EXIT_MS);
  }

  if (!wantOpen && !leaving) return null;

  // No mobile, a página de produto tem uma barra de compra fixa no rodapé;
  // o aviso fica logo acima dela, sem cobrir o botão.
  const onProduct = pathname?.startsWith('/produtos/');

  return (
    <div
      role="region"
      aria-label="Aviso de cookies"
      className={[
        'fixed z-[45] inset-x-3 sm:inset-x-auto sm:left-5 sm:bottom-5 sm:w-[22rem]',
        onProduct
          ? 'bottom-[calc(5.25rem+env(safe-area-inset-bottom))]'
          : 'bottom-[calc(0.75rem+env(safe-area-inset-bottom))]',
        'transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none',
        shown && wantOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none',
      ].join(' ')}
    >
      <div className="bg-paper border border-mist p-4 shadow-[0_8px_30px_rgba(30,18,8,0.12)]">
        <p className="text-[13px] leading-relaxed text-mid">
          Usamos cookies de análise para entender como o site é usado e melhorá-lo. Eles só são
          ativados se você aceitar.{' '}
          <Link
            href="/privacidade#cookies"
            className="text-ink underline underline-offset-2 hover:text-clay transition-colors"
          >
            Saiba mais
          </Link>
        </p>

        {status !== 'unset' && (
          <p className="mt-2 text-[11px] text-faint">
            Sua escolha atual: {status === 'granted' ? 'aceitar' : 'recusar'}. Você pode mudar quando quiser.
          </p>
        )}

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => choose(false)}
            className="h-9 flex-1 sm:flex-none sm:px-5 border border-ink/25 bg-transparent text-[12px] font-semibold tracking-[0.04em] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper"
          >
            Recusar
          </button>
          <button
            type="button"
            onClick={() => choose(true)}
            className="h-9 flex-1 sm:flex-none sm:px-5 border border-ink bg-ink text-[12px] font-semibold tracking-[0.04em] text-paper transition-colors hover:border-clay hover:bg-clay"
          >
            Aceitar
          </button>
        </div>
      </div>
    </div>
  );
}
