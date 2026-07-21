'use client';
import { useState } from 'react';
import type { Product } from '@/types';
import { ProductCard } from '@/components/product/ProductCard';
import { matchMattressSize, lookupAlias, type MattressSizeKey, type MattressWidthMap } from '@/lib/mattressSizeMatch';

interface Props {
  products: Product[];
  /** Largura de cada tamanho — vem da mesma tabela "Guia de tamanhos de cama" mostrada na página do produto (settings.bedSizeRows), nunca hardcoded aqui. */
  widths: MattressWidthMap;
}

type Mode = 'medir' | 'nome';

export function SizeGuideCalculator({ products, widths }: Props) {
  const SIZE_BUTTONS: { key: MattressSizeKey; label: string; desc: string }[] =
    (Object.keys(widths) as MattressSizeKey[]).map(key => ({
      key,
      label: widths[key].label,
      desc: `~${widths[key].widthCm}cm de largura`,
    }));

  const [mode, setMode] = useState<Mode>('medir');
  const [width, setWidth] = useState('');
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
    const h = height ? parseFloat(height.replace(',', '.')) : undefined;

    if (!w || w < 30 || w > 300) {
      setError('Confere a largura: em centímetros, de ponta a ponta do colchão (ex: 138).');
      setResult(null);
      return;
    }

    const r = matchMattressSize(widths, w, undefined, h);
    setResult(r.size);
    setHeightWarning(r.heightWarning);

    if (r.confidence === 'exata') {
      setConfidenceMsg(`Bateu certinho com o tamanho ${widths[r.size].label}.`);
    } else if (r.confidence === 'proxima') {
      setConfidenceMsg(
        r.runnerUp
          ? `Ficou entre ${widths[r.size].label} e ${widths[r.runnerUp].label}, mas o mais próximo é ${widths[r.size].label} (diferença de ${r.distanceCm}cm). Se puder, remeça pra confirmar.`
          : `O mais próximo é ${widths[r.size].label} (diferença de ${r.distanceCm}cm).`
      );
    } else {
      setConfidenceMsg(`Sua medida ficou bem diferente de todos os tamanhos que vendemos. O mais próximo seria ${widths[r.size].label}, mas confirma antes de comprar. Pode ser um colchão de tamanho especial.`);
    }
  }

  function handlePickName(key: MattressSizeKey) {
    setError('');
    setAliasNote(undefined);
    setHeightWarning(undefined);
    setResult(key);
    setConfidenceMsg(`Você selecionou ${widths[key].label}.`);
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
      setError('Não reconheço esse nome. Tenta usar o modo "Vou medir" com a largura em cm.');
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
          className={`px-5 py-2.5 text-[12px] font-semibold border transition-colors ${mode === 'medir' ? 'bg-ink text-paper border-ink' : 'border-mist text-mid hover:bg-warm'}`}>
          Vou medir agora
        </button>
        <button onClick={() => { setMode('nome'); setResult(null); setError(''); }}
          className={`px-5 py-2.5 text-[12px] font-semibold border transition-colors ${mode === 'nome' ? 'bg-ink text-paper border-ink' : 'border-mist text-mid hover:bg-warm'}`}>
          Já sei o nome
        </button>
      </div>

      {mode === 'medir' ? (
        <form onSubmit={handleMeasure} className="bg-paper border border-mist p-6 flex flex-col gap-4">
          <p className="text-[12px] text-faint leading-relaxed">
            Meça a <strong className="text-mid">largura do colchão</strong> (não da cama, do colchão em si), de ponta a ponta. É a medida que mais diferencia os tamanhos. A altura é opcional, mas ajuda se o seu colchão for bem alto ou bem fino.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-mid uppercase tracking-wide">Largura (cm)</label>
              <input value={width} onChange={e => setWidth(e.target.value)} inputMode="decimal" placeholder="138"
                className="border border-mist px-3 py-2.5 text-[14px] outline-none focus:border-clay-l bg-white dark:bg-warm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-mid uppercase tracking-wide">Altura (opcional)</label>
              <input value={height} onChange={e => setHeight(e.target.value)} inputMode="decimal" placeholder="25"
                className="border border-mist px-3 py-2.5 text-[14px] outline-none focus:border-clay-l bg-white dark:bg-warm" />
            </div>
          </div>
          {error && <p className="text-[12px] text-red-600">{error}</p>}
          <button type="submit" className="bg-clay-l text-paper text-[13px] font-semibold py-3 hover:bg-clay transition-colors">
            Descobrir meu tamanho
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {SIZE_BUTTONS.map(b => (
              <button key={b.key} onClick={() => handlePickName(b.key)}
                className={`border p-4 text-center transition-colors ${result === b.key ? 'bg-ink text-paper border-ink' : 'border-mist bg-paper hover:bg-warm text-ink'}`}>
                <p className="text-[14px] font-semibold">{b.label}</p>
                <p className={`text-[11px] mt-0.5 ${result === b.key ? 'text-[#D8C8B8]' : 'text-faint'}`}>{b.desc}</p>
              </button>
            ))}
          </div>
          <form onSubmit={handleOtherName} className="flex gap-2 items-center justify-center">
            <span className="text-[12px] text-faint">Ouviu outro nome (viúva, solteirão)?</span>
            <input value={otherName} onChange={e => setOtherName(e.target.value)} placeholder="ex: viúva"
              className="border border-mist px-3 py-2 text-[13px] outline-none focus:border-clay-l bg-white dark:bg-warm w-36" />
            <button type="submit" className="text-[12px] font-semibold text-clay-l hover:text-clay-d transition-colors">Ver</button>
          </form>
          {error && <p className="text-[12px] text-red-600 text-center">{error}</p>}
        </div>
      )}

      {result && (
        <div className="border-t border-mist pt-8 flex flex-col gap-5">
          <div className="text-center">
            <p className="font-mono text-[11px] tracking-[0.25em] uppercase text-faint mb-2">Recomendação</p>
            <p className="font-display text-3xl text-ink mb-2">{widths[result].label}</p>
            {confidenceMsg && <p className="text-[13px] text-mid max-w-[48ch] mx-auto leading-relaxed">{confidenceMsg}</p>}
            {aliasNote && <p className="text-[13px] text-clay-l max-w-[48ch] mx-auto leading-relaxed mt-2">{aliasNote}</p>}
            {heightWarning && <p className="text-[13px] text-clay-l max-w-[48ch] mx-auto leading-relaxed mt-2">{heightWarning}</p>}
          </div>

          {matchingProducts.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-5">
              {matchingProducts.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          ) : (
            <p className="text-[13px] text-faint text-center">Não temos produtos nesse tamanho no momento.</p>
          )}
        </div>
      )}
    </div>
  );
}
