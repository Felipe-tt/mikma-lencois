'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { registerSecondFactorPrompt } from '@/lib/auth/secondFactor';

type Pending = { factor: string; retry: boolean; resolve: (code: string | null) => void };

/** Janela do código de 6 dígitos da verificação em duas etapas. */
export function SecondFactorPromptHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    registerSecondFactorPrompt((factor, retry) => new Promise(resolve => {
      setValue('');
      setPending({ factor, retry, resolve });
    }));
    return () => registerSecondFactorPrompt(null);
  }, []);

  useEffect(() => { if (pending) inputRef.current?.focus(); }, [pending]);

  if (!pending) return null;

  const finish = (result: string | null) => {
    pending.resolve(result);
    setPending(null);
  };
  const digits = value.replace(/\D/g, '').slice(0, 6);

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-ink/50 p-4" role="dialog" aria-modal="true" aria-labelledby="mfa-title">
      <form
        className="w-full max-w-sm rounded-2xl bg-paper p-6 shadow-xl"
        onSubmit={e => { e.preventDefault(); if (digits.length === 6) finish(digits); }}
      >
        <h2 id="mfa-title" className="text-[17px] font-semibold text-ink">Verificação em duas etapas</h2>
        <p className="mt-1.5 text-[13px] text-mid leading-relaxed">
          Digite o código de 6 dígitos do <strong className="text-ink">{pending.factor}</strong>.
        </p>
        <input
          ref={inputRef}
          value={digits}
          onChange={e => setValue(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label="Código de 6 dígitos"
          className="mt-4 w-full rounded-xl border border-mist bg-paper px-4 py-3 text-center text-[22px] tracking-[0.4em] text-ink outline-none focus:border-ink"
          placeholder="000000"
        />
        {pending.retry && <p role="alert" className="mt-2 text-[12.5px] font-medium text-red-700">Código incorreto. Confira no app e tente de novo.</p>}
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={() => finish(null)} className="btn-outline flex-1">Cancelar</button>
          <button type="submit" disabled={digits.length !== 6} className="btn-primary flex-1 disabled:opacity-50">Confirmar</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
