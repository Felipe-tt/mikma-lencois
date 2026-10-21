'use client';

import { TEXTILE_COLORS } from '@/lib/colorNames';

const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * A cor é escrita por quem cadastra ("Azul marinho", "Rosa chá"…), do jeito
 * que ela chama a peça. O tom guardado (hex) vem da foto ou, se o nome for
 * uma cor conhecida, dela; não aparece na tela.
 */
export function ColorNameField({ id, value, colorName, invalid, onChange }: {
  id?: string;
  value: string;
  colorName: string;
  invalid?: boolean;
  onChange: (hex: string, name: string) => void;
}) {
  return (
    <input
      id={id}
      value={colorName}
      onChange={e => {
        const typed = e.target.value;
        const known = TEXTILE_COLORS.find(c => norm(c.name) === norm(typed));
        onChange(known?.hex ?? value, typed);
      }}
      placeholder="Ex.: Azul marinho"
      autoComplete="off"
      autoCapitalize="words"
      enterKeyHint="done"
      aria-invalid={invalid}
      className={`input text-[16px] ${invalid ? 'border-red-400' : ''}`}
    />
  );
}
