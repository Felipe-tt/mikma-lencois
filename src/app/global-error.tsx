'use client';
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { isChunkError, reloadOnce } from '@/lib/chunkErrorReload';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isChunk = isChunkError(error?.message);

  useEffect(() => {
    Sentry.captureException(error);
    // Erro de chunk desatualizado (pós-deploy): o botão "Tentar de novo"
    // não resolveria sozinho, porque reset() só re-renderiza usando os
    // MESMOS arquivos .js já carregados (e já quebrados) — precisa de um
    // reload completo de verdade, que busca tudo de novo do servidor.
    // Ver src/lib/chunkErrorReload.ts pro contexto completo (inclusive o
    // outro lugar que cobre a mesma classe de erro chegando como evento
    // global em vez de erro de renderização, ChunkErrorReload.tsx).
    if (isChunk) reloadOnce();
  }, [error, isChunk]);

  return (
    <html lang="pt-BR">
      <body>
        <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-paper">
          {isChunk ? (
            <>
              <p className="font-mono text-[11px] tracking-[0.25em] uppercase text-faint mb-6">
                Atualizando
              </p>
              <h1 className="font-serif text-ink leading-none tracking-[-0.02em] mb-6 text-[clamp(3rem,10vw,6rem)]">
                Só um instante
              </h1>
              <p className="text-[15px] text-mid max-w-[36ch] leading-relaxed">
                O site foi atualizado. Recarregando a página automaticamente…
              </p>
            </>
          ) : (
            <>
              <p className="font-mono text-[11px] tracking-[0.25em] uppercase text-faint mb-6">
                Erro inesperado
              </p>
              <h1 className="font-serif text-ink leading-none tracking-[-0.02em] mb-6 text-[clamp(3rem,10vw,6rem)]">
                Algo deu errado
              </h1>
              <p className="text-[15px] text-mid max-w-[36ch] leading-relaxed mb-10">
                Nossa equipe já foi avisada. Tenta recarregar a página, se continuar acontecendo, entra em contato com a loja.
              </p>
              <button
                onClick={() => reset()}
                className="inline-flex items-center justify-center h-12 px-7 bg-ink text-paper text-[13px] font-medium tracking-[0.05em] hover:bg-mid transition-colors duration-200"
              >
                Tentar de novo
              </button>
            </>
          )}
        </div>
      </body>
    </html>
  );
}
