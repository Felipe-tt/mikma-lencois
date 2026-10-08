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
  const visible = shown && wantOpen;

  return (
    <div
      role="region"
      aria-label="Aviso de cookies"
      className={[
        'fixed z-[45] inset-x-3 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[24rem]',
        onProduct
          ? 'bottom-[calc(5.25rem+env(safe-area-inset-bottom))]'
          : 'bottom-[calc(0.75rem+env(safe-area-inset-bottom))]',
        'transition-[opacity,transform] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
        visible
          ? 'duration-500 opacity-100 translate-y-0 sm:translate-x-0 scale-100'
          : 'duration-200 opacity-0 translate-y-4 sm:translate-y-0 sm:translate-x-6 scale-[0.98] pointer-events-none',
      ].join(' ')}
    >
      <div className="cookie-glass p-5">
        <div className="relative flex items-start gap-3.5">
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-clay/15 text-clay ring-1 ring-clay/25"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
              <path d="M8.5 8.5v.01" />
              <path d="M16 15.5v.01" />
              <path d="M12 12v.01" />
              <path d="M11 17v.01" />
              <path d="M7 14v.01" />
            </svg>
          </span>

          <div className="min-w-0">
            <p className="font-display text-[18px] leading-snug text-ink">Sua privacidade</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink/70">
              Usamos cookies de análise para entender como o site é usado e melhorá-lo. Eles só são
              ativados se você aceitar.{' '}
              <Link
                href="/politica-de-cookies"
                className="font-medium text-ink underline decoration-ink/30 underline-offset-[3px] transition-colors hover:text-clay hover:decoration-clay"
              >
                Saiba mais
              </Link>
            </p>
            {status !== 'unset' && (
              <p className="mt-2 text-[11.5px] text-ink/50">
                Escolha atual: {status === 'granted' ? 'aceitar' : 'recusar'}. Você pode mudar quando
                quiser.
              </p>
            )}
          </div>
        </div>

        <div className="relative mt-5 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => choose(false)}
            className="h-10 rounded-full border border-ink/20 bg-paper/40 text-[13px] font-medium tracking-[0.01em] text-ink backdrop-blur-sm transition-all duration-200 hover:border-ink/40 hover:bg-paper/70 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
          >
            Recusar
          </button>
          <button
            type="button"
            onClick={() => choose(true)}
            className="h-10 rounded-full bg-ink text-[13px] font-medium tracking-[0.01em] text-paper shadow-[0_4px_14px_-4px_rgb(var(--c-ink)/0.5)] transition-all duration-200 hover:bg-clay hover:shadow-[0_6px_18px_-4px_rgb(var(--c-clay)/0.6)] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
          >
            Aceitar
          </button>
        </div>
      </div>
    </div>
  );
}
