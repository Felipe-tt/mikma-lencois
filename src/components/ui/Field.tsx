'use client';

import { useId } from 'react';

/**
 * Rótulo + campo com associação de verdade.
 *
 * O painel tinha os rótulos como <label> soltos, irmãos do <input>, sem
 * htmlFor/id ligando os dois. Visualmente parecia certo, mas clicar no
 * texto do rótulo não focava o campo (comportamento que todo mundo
 * espera de formulário) e leitor de tela lia o campo como "campo de
 * texto, em branco", sem dizer do que se tratava.
 *
 * useId gera um id estável entre servidor e cliente, então não quebra a
 * hidratação do Next.
 *
 * `hint` fica ligado por aria-describedby: é lido depois do rótulo, em
 * vez de virar texto solto que o leitor de tela ignora. `error` usa
 * aria-invalid e é anunciado assim que aparece.
 */
export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (props: {
    id: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
    required?: boolean;
  }) => React.ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-[11px] font-semibold text-mid mb-1.5">
        {label}
        {required && <span className="text-clay-l ml-0.5" aria-hidden="true">*</span>}
      </label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        required,
      })}
      {hint && !error && (
        <p id={hintId} className="text-[11px] text-faint mt-1 leading-relaxed">{hint}</p>
      )}
      {error && (
        <p id={errorId} className="text-[11px] text-red-600 mt-1 leading-relaxed">{error}</p>
      )}
    </div>
  );
}
