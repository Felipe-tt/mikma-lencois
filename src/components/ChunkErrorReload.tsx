'use client';
import { useEffect } from 'react';

/**
 * Depois de um deploy, o servidor troca os arquivos .js/.css por versões
 * com hash novo e apaga os antigos. Quem estava com a aba já aberta (ou
 * navegou de um cache antigo) tenta buscar um arquivo que não existe mais
 * -> 404 -> "ChunkLoadError" -> a navegação trava e a página fica quebrada
 * até a pessoa lembrar de dar F5 sozinha.
 *
 * Aqui a gente detecta esse erro especificamente e força um reload completo
 * (não client-side) uma única vez, que sempre busca o HTML/manifesto novo
 * do servidor e resolve sozinho. Um contador em sessionStorage evita loop
 * infinito de reload caso o problema seja outra coisa.
 */
const RELOAD_KEY = 'mikma_chunk_reload_attempt';

function isChunkError(reason: unknown): boolean {
  const msg = String(
    (reason && typeof reason === 'object' && 'message' in reason ? (reason as { message?: unknown }).message : reason) ?? ''
  );
  return /ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(msg);
}

function reloadOnce() {
  const already = window.sessionStorage.getItem(RELOAD_KEY);
  if (already) return; // já tentamos nessa sessão de aba, não insiste pra não loopar
  window.sessionStorage.setItem(RELOAD_KEY, '1');
  window.location.reload();
}

export function ChunkErrorReload() {
  useEffect(() => {
    // Chegou até aqui rodando -> os chunks atuais carregaram direitinho.
    // Limpa a marca de tentativa anterior pra que um deploy futuro nessa
    // mesma aba também consiga disparar um reload automático.
    window.sessionStorage.removeItem(RELOAD_KEY);

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
