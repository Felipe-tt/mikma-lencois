'use client';
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body>
        <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-paper">
          <p className="font-mono text-[11px] tracking-[0.25em] uppercase text-faint mb-6">
            Erro inesperado
          </p>
          <h1 className="font-serif text-ink leading-none tracking-[-0.02em] mb-6 text-[clamp(3rem,10vw,6rem)]">
            Algo deu errado
          </h1>
          <p className="text-[15px] text-mid max-w-[36ch] leading-relaxed mb-10">
            Nossa equipe já foi avisada. Tenta recarregar a página — se continuar acontecendo, entra em contato com a loja.
          </p>
          <button
            onClick={() => reset()}
            className="inline-flex items-center justify-center h-12 px-7 bg-ink text-paper text-[13px] font-medium tracking-[0.05em] hover:bg-mid transition-colors duration-200"
          >
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  );
}
