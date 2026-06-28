'use client';

import { useEffect, useRef, useState } from 'react';
import { TEXTILE_COLORS, hexToColorName, searchColorsByName, resolveColorName } from '@/lib/colorNames';

interface Props {
  value: string;      // hex
  colorName: string;
  onChange: (hex: string, name: string) => void;
}

/**
 * Seletor de cor — 100% local, instantâneo, sem chamadas de rede.
 * Três formas de escolher: clicar num swatch da paleta, digitar o nome
 * (com autocomplete), ou usar o seletor de cor nativo do navegador.
 */
export function ColorPicker({ value, colorName, onChange }: Props) {
  const [inputName, setInputName] = useState(colorName || '');
  const [suggestions, setSuggestions] = useState<Array<{ name: string; hex: string }>>([]);
  const [showSugg, setShowSugg] = useState(false);
  const [showSwatches, setShowSwatches] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Sincroniza quando o valor externo muda (ex: cor escolhida por foto)
  useEffect(() => {
    if (colorName !== inputName) setInputName(colorName || '');
  }, [colorName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fecha dropdowns ao clicar fora
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowSugg(false);
        setShowSwatches(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setInputName(q);
    setError('');
    setShowSwatches(false);
    clearTimeout(debounceRef.current);
    if (q.length < 1) { setSuggestions([]); setShowSugg(false); return; }
    // Local — não precisa de debounce de verdade, mas mantém a digitação fluida
    debounceRef.current = setTimeout(() => {
      const results = searchColorsByName(q, 8);
      setSuggestions(results);
      setShowSugg(results.length > 0);
    }, 80);
  }

  function pickSuggestion(s: { name: string; hex: string }) {
    setInputName(s.name);
    setSuggestions([]);
    setShowSugg(false);
    onChange(s.hex, s.name);
  }

  function confirmName() {
    setShowSugg(false);
    if (!inputName.trim() || inputName === colorName) return;
    const found = resolveColorName(inputName);
    if (found) {
      setInputName(found.name);
      onChange(found.hex, found.name);
      setError('');
    } else {
      setError('Não encontramos essa cor — escolha uma sugestão ou use a paleta');
    }
  }

  function pickHex(hex: string) {
    const name = hexToColorName(hex);
    setInputName(name);
    setError('');
    onChange(hex, name);
  }

  return (
    <div ref={wrapRef} className="relative flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {/* Swatch atual — clique abre a paleta rápida */}
        <button
          type="button"
          onClick={() => { setShowSwatches(s => !s); setShowSugg(false); }}
          style={{ background: value || '#cccccc' }}
          className="w-9 h-9 border-2 border-mist shrink-0 transition-transform active:scale-95 relative rounded-[4px]"
          title="Escolher da paleta"
          aria-label="Abrir paleta de cores"
        >
          <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-white border border-mist rounded-full flex items-center justify-center">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-faint"><path d="M6 9l6 6 6-6"/></svg>
          </span>
        </button>

        {/* Campo de nome com autocomplete */}
        <div className="relative flex-1">
          <input
            type="text"
            value={inputName}
            onChange={handleInput}
            onFocus={() => {
              if (inputName.length > 0) {
                setSuggestions(searchColorsByName(inputName, 8));
                setShowSugg(true);
              }
            }}
            onBlur={confirmName}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), confirmName())}
            placeholder="Nome da cor"
            className={`input-sm h-9 text-sm ${error ? 'border-red-400' : ''}`}
            autoComplete="off"
          />

          {showSugg && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-30 bg-white border border-mist shadow-card-hover mt-1 max-h-52 overflow-y-auto rounded-[4px]">
              {suggestions.map(s => (
                <button
                  key={s.hex}
                  type="button"
                  onMouseDown={() => pickSuggestion(s)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-warm text-left transition-colors"
                >
                  <span className="w-4 h-4 border border-mist shrink-0 rounded-[3px]" style={{ background: s.hex }} />
                  <span className="text-sm text-ink">{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Seletor nativo — fallback pra cor exata fora da paleta */}
        <input
          type="color"
          value={value.length === 7 && value.startsWith('#') ? value : '#cccccc'}
          onChange={e => pickHex(e.target.value)}
          className="w-9 h-9 border border-mist cursor-pointer p-0.5 shrink-0 bg-paper rounded-[4px]"
          title="Cor exata (seletor do navegador)"
        />
      </div>

      {/* Paleta rápida — grade de swatches */}
      {showSwatches && (
        <div className="absolute top-11 left-0 right-0 sm:right-auto z-30 bg-white border border-mist shadow-card-hover p-3 rounded-[4px]" style={{ maxWidth: 264 }}>
          <p className="text-[9px] font-bold tracking-[0.14em] uppercase text-faint mb-2">Paleta têxtil</p>
          <div className="grid grid-cols-6 gap-2 max-h-48 overflow-y-auto pr-1">
            {TEXTILE_COLORS.map(c => (
              <button
                key={c.hex}
                type="button"
                onClick={() => { setInputName(c.name); setError(''); onChange(c.hex, c.name); setShowSwatches(false); }}
                className={`w-8 h-8 border transition-transform hover:scale-110 shrink-0 rounded-[4px] ${value?.toLowerCase() === c.hex.toLowerCase() ? 'ring-2 ring-clay ring-offset-1' : 'border-mist'}`}
                style={{ background: c.hex }}
                title={c.name}
                aria-label={c.name}
              />
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {error}
        </p>
      )}
    </div>
  );
}
