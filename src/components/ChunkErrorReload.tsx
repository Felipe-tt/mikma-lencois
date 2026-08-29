'use client';
import { useEffect } from 'react';
import { isChunkError, reloadOnce, clearReloadAttempt } from '@/lib/chunkErrorReload';

// Pega o erro de chunk desatualizado quando ele aparece como evento global
// (window.error / unhandledrejection). Ver src/lib/chunkErrorReload.ts pro
// contexto completo — inclusive o outro lugar que também precisa disso
// (src/app/global-error.tsx), pra erros que sobem pela árvore do React
// em vez de aparecerem como evento global.
export function ChunkErrorReload() {
  useEffect(() => {
    // Chegou até aqui rodando -> os chunks atuais carregaram direitinho.
    // Limpa a marca de tentativa anterior pra que um deploy futuro nessa
    // mesma aba também consiga disparar um reload automático.
    clearReloadAttempt();

    function onError(event: ErrorEvent) {
      if (isChunkError(event.error) || isChunkError(event.message)) reloadOnce();
    }
    function onRejection(event: PromiseRejectionEvent) {
      if (isChunkError(event.reason)) reloadOnce();
    }
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
