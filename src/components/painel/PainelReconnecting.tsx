'use client';
import { useEffect, useState } from 'react';

/**
 * Detecta quando a aba volta de um período parado em segundo plano (ex:
 * usuário trocou de aba/app e voltou minutos depois) e por quanto tempo
 * ficou assim. É nesse momento que o Firebase Auth força refresh do token
 * e os listeners do Firestore (onSnapshot) precisam reconectar — processo
 * que pode levar alguns segundos e, sem nenhum indicador, parece que o
 * painel travou (a página antiga continua na tela, parada, sem skeleton,
 * porque cada onSnapshot já tinha resolvido `loading` uma vez antes).
 *
 * Limiar de 60s: trocas rápidas de aba não devem mostrar nada — só vale a
 * pena avisar quando o tempo parado é grande o suficiente pra justificar
 * uma reconexão real.
 */
const IDLE_THRESHOLD_MS = 60_000;
const MAX_BANNER_MS = 6_000; // some sozinho mesmo se nada confirmar a reconexão

export function usePainelReconnecting() {
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    let hiddenAt: number | null = null;

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      // Voltou a ficar visível.
      if (hiddenAt !== null && Date.now() - hiddenAt >= IDLE_THRESHOLD_MS) {
        setReconnecting(true);
        setTimeout(() => setReconnecting(false), MAX_BANNER_MS);
      }
      hiddenAt = null;
    }

    function handleOnline() {
      // Voltou a ter rede depois de ter caído — mesmo cenário de
      // reconexão silenciosa do Firestore.
      setReconnecting(true);
      setTimeout(() => setReconnecting(false), MAX_BANNER_MS);
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return reconnecting;
}

export function PainelReconnectingBanner() {
  const reconnecting = usePainelReconnecting();

  if (!reconnecting) return null;

  return (
    <div
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-2 px-3.5 py-2 bg-ink text-paper text-[12px] font-medium shadow-lg rounded-sm animate-fade-in"
      role="status"
      aria-live="polite"
    >
      <svg className="shrink-0 animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      Reconectando…
    </div>
  );
}
