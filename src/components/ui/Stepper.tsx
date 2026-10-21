'use client';

/**
 * Quantidade com botões grandes de − e +, e o número no meio para quem
 * prefere digitar. Feito para o dedo no celular: cada botão tem 48px.
 */
export function Stepper({ id, labelledBy, value, min = 0, max = 9999, onChange }: {
  id?: string;
  labelledBy?: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const btn = 'w-12 h-12 flex items-center justify-center text-[22px] leading-none text-ink disabled:text-faint/50 active:bg-warm transition-colors';
  return (
    <div className="inline-flex items-stretch border border-mist rounded-xl bg-paper overflow-hidden" role="group" aria-labelledby={labelledBy}>
      <button type="button" className={btn} onClick={() => onChange(clamp(value - 1))} disabled={value <= min} aria-label="Diminuir">−</button>
      <input
        id={id}
        aria-labelledby={labelledBy}
        value={String(value)}
        inputMode="numeric"
        onFocus={e => e.target.select()}
        onChange={e => {
          const digits = e.target.value.replace(/\D/g, '');
          onChange(clamp(digits === '' ? min : parseInt(digits, 10)));
        }}
        className="w-16 text-center text-[17px] font-semibold text-ink border-x border-mist bg-transparent focus:outline-none focus:bg-warm/40"
      />
      <button type="button" className={btn} onClick={() => onChange(clamp(value + 1))} disabled={value >= max} aria-label="Aumentar">+</button>
    </div>
  );
}
