'use client';
import { useEffect, useRef, useState } from 'react';
import type { Product } from '@/types';
import { ProductCard } from '@/components/product/ProductCard';
import { matchMattressSize, lookupAlias, type MattressSizeKey, type MattressWidthMap } from '@/lib/mattressSizeMatch';

interface Props {
  products: Product[];
  /** Largura de cada tamanho, vem da mesma tabela "Guia de tamanhos de cama" mostrada na página do produto (settings.bedSizeRows), nunca hardcoded aqui. */
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
  const resultRef = useRef<HTMLDivElement>(null);

  // No celular a recomendação aparece abaixo da dobra: sem rolar, parece
  // que o botão não fez nada.
  useEffect(() => {
    const el = resultRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    if (top > window.innerHeight * 0.6) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  }, [result]);

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
      {/* Seletor de modo: controle segmentado com o fundo escuro deslizando
          entre as opções. Antes eram dois botões soltos de larguras
          diferentes, que pareciam ações independentes. */}
      <div className="relative grid grid-cols-2 w-full max-w-[380px] mx-auto rounded-full border border-mist-d p-1" role="group" aria-label="Como você quer descobrir o tamanho">
        <span
          aria-hidden="true"
          className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-full bg-ink transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none"
          style={{ transform: mode === 'nome' ? 'translateX(100%)' : 'translateX(0)' }}
        />
        {([['medir', 'Vou medir agora'], ['nome', 'Já sei o nome']] as const).map(([key, label]) => (
          <button key={key} type="button" aria-pressed={mode === key}
            onClick={() => { setMode(key); setResult(null); setError(''); }}
            className={`relative z-10 h-10 text-[12px] font-semibold transition-colors duration-300 ${mode === key ? 'text-paper' : 'text-mid hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>

      {mode === 'medir' ? (
        <form onSubmit={handleMeasure} className="bg-paper border border-mist rounded-3xl p-5 sm:p-7 flex flex-col gap-4 animate-fade-in">
          <p className="text-[13px] text-mid leading-relaxed">
            Passe a fita de uma lateral à outra do <strong className="text-ink font-semibold">colchão</strong>, por cima. A altura é opcional, mas ajuda se o seu colchão for bem alto ou bem fino.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="guia-largura" className="text-[11px] font-bold text-mid uppercase tracking-wide">Largura (cm)</label>
              <input id="guia-largura" value={width} onChange={e => setWidth(e.target.value)} inputMode="decimal" placeholder="138"
                className="h-12 min-w-0 rounded-xl border border-mist-d px-4 text-[16px] sm:text-[14px] outline-none focus:border-ink transition-colors duration-150 bg-white dark:bg-warm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="guia-altura" className="text-[11px] font-bold text-mid uppercase tracking-wide">Altura (cm, opcional)</label>
              <input id="guia-altura" value={height} onChange={e => setHeight(e.target.value)} inputMode="decimal" placeholder="25"
                className="h-12 min-w-0 rounded-xl border border-mist-d px-4 text-[16px] sm:text-[14px] outline-none focus:border-ink transition-colors duration-150 bg-white dark:bg-warm" />
            </div>
          </div>
          {error && <p role="alert" className="text-[12px] text-red-600 animate-fade-in">{error}</p>}
          <button type="submit" className="h-12 rounded-full bg-ink text-paper text-[13px] font-semibold tracking-[0.03em] hover:bg-clay active:scale-[0.99] transition-[background-color,transform] duration-200">
            Descobrir meu tamanho
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-4 animate-fade-in">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {SIZE_BUTTONS.map(b => (
              <button key={b.key} type="button" aria-pressed={result === b.key} onClick={() => handlePickName(b.key)}
                className={`rounded-2xl border p-4 text-center active:scale-[0.98] transition-[background-color,border-color,color,transform] duration-150 ${result === b.key ? 'bg-ink text-paper border-ink' : 'border-mist-d bg-paper hover:border-ink text-ink'}`}>
                <p className="text-[14px] font-semibold">{b.label}</p>
                <p className={`text-[11px] mt-0.5 ${result === b.key ? 'text-paper/70' : 'text-faint'}`}>{b.desc}</p>
              </button>
            ))}
          </div>
          <form onSubmit={handleOtherName} className="flex flex-wrap gap-2 items-center justify-center">
            <span className="text-[12px] text-faint">Ouviu outro nome (viúva, solteirão)?</span>
            <input value={otherName} onChange={e => setOtherName(e.target.value)} placeholder="ex: viúva" aria-label="Outro nome de tamanho"
              className="h-10 rounded-full border border-mist-d px-4 text-[16px] sm:text-[13px] outline-none focus:border-ink transition-colors duration-150 bg-white dark:bg-warm w-36" />
            <button type="submit" className="h-10 px-5 rounded-full border border-ink text-[12px] font-semibold text-ink hover:bg-ink hover:text-paper transition-colors duration-150">Ver</button>
          </form>
          {error && <p role="alert" className="text-[12px] text-red-600 text-center animate-fade-in">{error}</p>}
        </div>
      )}

      {result && (
        <div key={result} ref={resultRef} className="scroll-mt-20 border-t border-mist pt-8 flex flex-col gap-5 animate-fade-up">
          <div className="text-center">
            <p className="font-semibold text-[11px] tracking-[0.25em] uppercase text-faint mb-2">Recomendação</p>
            <p className="font-display text-3xl text-ink mb-2">{widths[result].label}</p>
            {confidenceMsg && <p className="text-[13px] text-mid max-w-[48ch] mx-auto leading-relaxed">{confidenceMsg}</p>}
            {aliasNote && <p className="text-[13px] text-clay max-w-[48ch] mx-auto leading-relaxed mt-2">{aliasNote}</p>}
            {heightWarning && <p className="text-[13px] text-clay max-w-[48ch] mx-auto leading-relaxed mt-2">{heightWarning}</p>}
          </div>

          {matchingProducts.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-6 sm:gap-x-5 sm:gap-y-9">
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
