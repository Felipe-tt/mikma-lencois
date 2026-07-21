'use client';

import { useEffect, useId, useRef, useState } from 'react';

export type SelectOption = { value: string; label: string; disabled?: boolean };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  /** Classe do botão/trigger — por padrão usa o mesmo visual do .select nativo do site */
  triggerClassName?: string;
  disabled?: boolean;
  name?: string;
  size?: 'sm' | 'md';
};

/**
 * Dropdown com estilo próprio do site (mesmos tokens de cor/borda dos inputs),
 * substituindo o <select> nativo do navegador — que não tem como ser
 * estilizado de forma consistente entre navegadores (a lista de opções em
 * si sempre usa o tema do SO/browser, ex: fundo azul do Chrome no Windows).
 *
 * Mantém o mesmo "shape" de API do onChange(value) pra ser um drop-in
 * replacement dos <select> espalhados pelo painel.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = 'Selecione',
  className = '',
  triggerClassName,
  disabled,
  name,
  size = 'md',
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();

  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); return; }
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      const idx = options.findIndex(o => o.value === value);
      setActiveIndex(idx >= 0 ? idx : 0);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && activeIndex >= 0) {
      const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [open, activeIndex]);

  function handleTriggerKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      setOpen(true);
    }
  }

  function handleListKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(options.length - 1, (i < 0 ? -1 : i) + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(0, (i < 0 ? 1 : i) - 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const opt = options[activeIndex];
      if (opt && !opt.disabled) { onChange(opt.value); setOpen(false); }
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  }

  const sizeClasses = size === 'sm'
    ? 'px-3 py-2.5 text-sm'
    : 'px-4 py-3 text-sm';

  const defaultTrigger = `w-full ${sizeClasses} bg-white dark:bg-warm text-ink text-left
    border border-mist outline-none flex items-center justify-between gap-2
    focus:border-clay/60 focus:ring-2 focus:ring-clay/[0.12]
    hover:border-ink/20 transition-all duration-150
    disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer rounded-[2px]`;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        onKeyDown={handleTriggerKeyDown}
        className={triggerClassName ?? defaultTrigger}
      >
        <span className={selected ? '' : 'text-faint'}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          className={`shrink-0 text-faint transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <ul
          ref={listRef}
          id={`${id}-listbox`}
          role="listbox"
          tabIndex={-1}
          onKeyDown={handleListKeyDown}
          className="absolute z-50 mt-1 w-full max-h-64 overflow-auto bg-white dark:bg-warm
            border border-mist rounded-[2px] shadow-lg py-1 focus:outline-none"
        >
          {options.length === 0 && (
            <li className="px-3 py-2 text-sm text-faint italic select-none">Nenhuma opção</li>
          )}
          {options.map((opt, i) => {
            const isSelected = opt.value === value;
            const isActive = i === activeIndex;
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => {
                  if (opt.disabled) return;
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`px-3 py-2 text-sm cursor-pointer select-none flex items-center justify-between gap-2
                  ${opt.disabled ? 'opacity-40 cursor-not-allowed' : ''}
                  ${isActive ? 'bg-clay/10 text-ink' : 'text-ink'}
                  ${isSelected ? 'font-semibold' : ''}`}
              >
                <span>{opt.label}</span>
                {isSelected && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-clay shrink-0">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
