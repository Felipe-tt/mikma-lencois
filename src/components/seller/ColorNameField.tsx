'use client';

import { TEXTILE_COLORS } from '@/lib/colorNames';
import { colorKey } from '@/lib/colorNameMatch';

export type ColorCheck =
  | { state: 'empty' | 'ok' }
  | { state: 'existing'; name: string }
  | { state: 'typo'; name: string }
  | { state: 'new'; spelling?: string };

/**
 * A cor é escrita por quem cadastra ("Azul marinho"…). Embaixo do campo,
 * a conferência com as cores que a loja já tem: confirma quando já existe,
 * pergunta quando parece erro de digitação e, quando é nova, mostra as
 * cores da loja e pede confirmação antes de criar mais uma.
 */
export function ColorNameField({ id, value, colorName, check, storeColors, invalid, onChange, onKeepTypo, onConfirmNew, onBlur }: {
  id?: string;
  value: string;
  colorName: string;
  check: ColorCheck;
  storeColors: string[];
  invalid?: boolean;
  onChange: (hex: string, name: string) => void;
  onKeepTypo: () => void;
  onConfirmNew: () => void;
  onBlur: () => void;
}) {
  const pick = (name: string) => {
    const known = TEXTILE_COLORS.find(c => colorKey(c.name) === colorKey(name));
    onChange(known?.hex ?? value, name);
  };
  const chip = 'rounded-full border border-mist bg-paper px-3 py-1.5 text-[13px] text-ink hover:border-clay/50';

  return (
    <div className="flex flex-col gap-2">
      <input
        id={id}
        value={colorName}
        onChange={e => pick(e.target.value)}
        onBlur={onBlur}
        placeholder="Ex.: Azul marinho"
        autoComplete="off"
        autoCapitalize="words"
        enterKeyHint="done"
        aria-invalid={invalid}
        className={`input text-[16px] ${invalid ? 'border-red-400' : ''}`}
      />

      {check.state === 'existing' && (
        <p className="text-[12px] text-emerald-700 flex items-center gap-1.5">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>
          Cor já usada na loja: {check.name}
        </p>
      )}

      {check.state === 'typo' && (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 flex flex-col gap-2.5">
          <p className="text-[13px] text-amber-900">
            Você quis dizer <strong>{check.name}</strong>? Essa cor já existe na loja.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => pick(check.name)} className="rounded-full bg-ink text-paper px-4 py-2 text-[13px] font-semibold">
              Usar {check.name}
            </button>
            <button type="button" onClick={onKeepTypo} className="rounded-full border border-amber-400 px-4 py-2 text-[13px] font-semibold text-amber-900">
              Não, é outra cor
            </button>
          </div>
        </div>
      )}

      {check.state === 'new' && (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 flex flex-col gap-2.5">
          <p className="text-[13px] text-amber-900">
            <strong>{colorName.trim()}</strong> ainda não existe na loja. Confira se não é uma destas:
          </p>
          {check.spelling && (
            <button type="button" onClick={() => pick(check.spelling!)} className="self-start text-[13px] font-semibold text-clay underline underline-offset-2">
              Escrever do jeito certo: {check.spelling}
            </button>
          )}
          {storeColors.length > 0 ? (
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
              {storeColors.map(c => (
                <button key={c} type="button" onClick={() => pick(c)} className={chip}>{c}</button>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-amber-800">Nenhuma cor cadastrada ainda.</p>
          )}
          <button type="button" onClick={onConfirmNew} className="self-start rounded-full bg-ink text-paper px-4 py-2 text-[13px] font-semibold">
            Sim, é uma cor nova
          </button>
        </div>
      )}
    </div>
  );
}
