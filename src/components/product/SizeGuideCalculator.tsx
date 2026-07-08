'use client';
import { useState } from 'react';
import type { Product } from '@/types';
import { ProductCard } from '@/components/product/ProductCard';
import { matchMattressSize, lookupAlias, MATTRESS_SIZES, type MattressSizeKey } from '@/lib/mattressSizeMatch';

interface Props {
  products: Product[];
}

type Mode = 'medir' | 'nome';

const SIZE_BUTTONS: { key: MattressSizeKey; label: string; desc: string }[] = [
  { key: 'solteiro', label: 'Solteiro', desc: '~88×188cm' },
  { key: 'casal',    label: 'Casal',    desc: '~138×188cm' },
  { key: 'queen',    label: 'Queen',    desc: '~158×198cm' },
  { key: 'king',     label: 'King',     desc: '~193×203cm' },
];

export function SizeGuideCalculator({ products }: Props) {
  const [mode, setMode] = useState<Mode>('medir');
  const [width, setWidth] = useState('');
  const [length, setLength] = useState('');
  const [height, setHeight] = useState('');
  const [otherName, setOtherName] = useState('');

  const [result, setResult] = useState<MattressSizeKey | null>(null);
  const [confidenceMsg, setConfidenceMsg] = useState('');
  const [heightWarning, setHeightWarning] = useState<string | undefined>();
  const [aliasNote, setAliasNote] = useState<string | undefined>();
  const [error, setError] = useState('');

  function handleMeasure(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setAliasNote(undefined);
    const w = parseFloat(width.replace(',', '.'));
    const l = parseFloat(length.replace(',', '.'));
    const h = height ? parseFloat(height.replace(',', '.')) : undefined;

    if (!w || !l || w < 30 || l < 30 || w > 300 || l > 300) {
      setError('Confere as medidas — largura e comprimento em centímetros (ex: 138 e 188).');
      setResult(null);
      return;
    }

    const r = matchMattressSize(w, l, h);
    setResult(r.size);
    setHeightWarning(r.heightWarning);

    if (r.confidence === 'exata') {
      setConfidenceMsg(`Bateu certinho com o tamanho ${MATTRESS_SIZES[r.size].label}.`);
    } else if (r.confidence === 'proxima') {
      setConfidenceMsg(
        r.runnerUp
          ? `Ficou entre ${MATTRESS_SIZES[r.size].label} e ${MATTRESS_SIZES[r.runnerUp].label}, mas o mais próximo é ${MATTRESS_SIZES[r.size].label} (diferença de ${r.distanceCm}cm). Se puder, remeça pra confirmar.`
          : `O mais próximo é ${MATTRESS_SIZES[r.size].label} (diferença de ${r.distanceCm}cm nas duas medidas somadas).`
      );
    } else {
      setConfidenceMsg(`Suas medidas ficaram bem diferentes de todos os tamanhos que vendemos — o mais próximo seria ${MATTRESS_SIZES[r.size].label}, mas confirma antes de comprar. Pode ser um colchão de tamanho especial.`);
    }
  }

  function handlePickName(key: MattressSizeKey) {
    setError('');
    setAliasNote(undefined);
    setHeightWarning(undefined);
    setResult(key);
    setConfidenceMsg(`Você selecionou ${MATTRESS_SIZES[key].label}.`);
  }

  function handleOtherName(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!otherName.trim()) return;
    const alias = lookupAlias(otherName);
    if (alias) {
      setResult(alias.closest);
      setAliasNote(alias.note);
      setConfidenceMsg('');
    } else {
      setResult(null);
      setError('Não reconheço esse nome — tenta usar o modo "Vou medir" com a largura e o comprimento em cm.');
    }
  }

  const matchingProducts = result
    ? products.filter(p => p.variants?.some(v => v.size === result))
    : [];

  return (
    <div className="flex flex-col gap-8">
      {/* Seletor de modo */}
      <div className="flex gap-2 justify-center">
        <button onClick={() => { setMode('medir'); setResult(null); setError(''); }}
          className={`px-5 py-2.5 text-[12px] font-semibold border transition-colors ${mode === 'medir' ? 'bg-[#1E1208] text-[#FAF8F5] border-[#1E1208]' : 'border-[#E6DFD5] text-[#705A48] hover:bg-[#F0EBE1]'}`}>
          Vou medir agora
        </button>
        <button onClick={() => { setMode('nome'); setResult(null); setError(''); }}
          className={`px-5 py-2.5 text-[12px] font-semibold border transition-colors ${mode === 'nome' ? 'bg-[#1E1208] text-[#FAF8F5] border-[#1E1208]' : 'border-[#E6DFD5] text-[#705A48] hover:bg-[#F0EBE1]'}`}>
          Já sei o nome
        </button>
      </div>

      {mode === 'medir' ? (
        <form onSubmit={handleMeasure} className="bg-[#FAF8F5] border border-[#E6DFD5] p-6 flex flex-col gap-4">
          <p className="text-[12px] text-[#B09C8C] leading-relaxed">
            Meça o <strong className="text-[#705A48]">colchão</strong> (não a cama) com uma trena ou fita métrica, de ponta a ponta. A altura é opcional, mas ajuda se o seu colchão for bem alto ou bem fino.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-[#705A48] uppercase tracking-wide">Largura (cm)</label>
              <input value={width} onChange={e => setWidth(e.target.value)} inputMode="decimal" placeholder="138"
                className="border border-[#E6DFD5] px-3 py-2.5 text-[14px] outline-none focus:border-[#C4714A] bg-white" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-[#705A48] uppercase tracking-wide">Comprimento (cm)</label>
              <input value={length} onChange={e => setLength(e.target.value)} inputMode="decimal" placeholder="188"
                className="border border-[#E6DFD5] px-3 py-2.5 text-[14px] outline-none focus:border-[#C4714A] bg-white" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-[#705A48] uppercase tracking-wide">Altura (opcional)</label>
              <input value={height} onChange={e => setHeight(e.target.value)} inputMode="decimal" placeholder="25"
                className="border border-[#E6DFD5] px-3 py-2.5 text-[14px] outline-none focus:border-[#C4714A] bg-white" />
            </div>
          </div>
          {error && <p className="text-[12px] text-red-600">{error}</p>}
          <button type="submit" className="bg-[#C4714A] text-white text-[13px] font-semibold py-3 hover:bg-[#B0603C] transition-colors">
            Descobrir meu tamanho
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {SIZE_BUTTONS.map(b => (
              <button key={b.key} onClick={() => handlePickName(b.key)}
                className={`border p-4 text-center transition-colors ${result === b.key ? 'bg-[#1E1208] text-[#FAF8F5] border-[#1E1208]' : 'border-[#E6DFD5] bg-[#FAF8F5] hover:bg-[#F0EBE1] text-[#1E1208]'}`}>
                <p className="text-[14px] font-semibold">{b.label}</p>
                <p className={`text-[11px] mt-0.5 ${result === b.key ? 'text-[#D8C8B8]' : 'text-[#B09C8C]'}`}>{b.desc}</p>
              </button>
            ))}
          </div>
          <form onSubmit={handleOtherName} className="flex gap-2 items-center justify-center">
            <span className="text-[12px] text-[#B09C8C]">Ouviu outro nome (viúva, solteirão)?</span>
            <input value={otherName} onChange={e => setOtherName(e.target.value)} placeholder="ex: viúva"
              className="border border-[#E6DFD5] px-3 py-2 text-[13px] outline-none focus:border-[#C4714A] bg-white w-36" />
            <button type="submit" className="text-[12px] font-semibold text-[#C4714A] hover:text-[#A05432] transition-colors">Ver</button>
          </form>
          {error && <p className="text-[12px] text-red-600 text-center">{error}</p>}
        </div>
      )}

      {result && (
        <div className="border-t border-[#E6DFD5] pt-8 flex flex-col gap-5">
          <div className="text-center">
            <p className="font-mono text-[11px] tracking-[0.25em] uppercase text-[#9C8878] mb-2">Recomendação</p>
            <p className="font-display text-3xl text-[#1E1208] mb-2">{MATTRESS_SIZES[result].label}</p>
            {confidenceMsg && <p className="text-[13px] text-[#705A48] max-w-[48ch] mx-auto leading-relaxed">{confidenceMsg}</p>}
            {aliasNote && <p className="text-[13px] text-[#C4714A] max-w-[48ch] mx-auto leading-relaxed mt-2">{aliasNote}</p>}
            {heightWarning && <p className="text-[13px] text-[#C4714A] max-w-[48ch] mx-auto leading-relaxed mt-2">{heightWarning}</p>}
          </div>

          {matchingProducts.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-5">
              {matchingProducts.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          ) : (
            <p className="text-[13px] text-[#B09C8C] text-center">Não temos produtos nesse tamanho no momento.</p>
          )}
        </div>
      )}
    </div>
  );
}
