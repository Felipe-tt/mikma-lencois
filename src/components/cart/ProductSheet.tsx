'use client';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Overlay } from '@/components/ui/Overlay';
import { IconX } from '@/components/ui/Icon';
import { formatCurrency } from '@/lib/utils/format';
import { variantLabel } from '@/lib/variantLabel';
import { FABRIC_LABEL, SIZE_LABEL } from '@/lib/productOptions';
import { getFronhaCount, swapPairsPerUnit } from '@/lib/fronhaSwap';
import { MAX_SHARED_QTY } from '@/lib/sharedCart';
import type { PackageLine } from '@/lib/packageContents';
import { FronhaChooser, fronhaOptionsFrom } from '@/components/product/FronhaChooser';
import { SizeMeasures, lineForSize } from '@/components/product/SizeMeasures';
import type { Product } from '@/types';

export interface SheetAddOptions { swapSku: string | null; quantity: number }

/**
 * Detalhes do produto sem sair do "Montar junto", com o mesmo que a página
 * do produto oferece: fotos, a opção com a cor, o estoque ("só restam 2"),
 * as medidas do que vem no pacote, a troca da fronha (jogo de cama) e a
 * quantidade. Em celular abre como folha de baixo, no computador como janela.
 */
export function ProductSheet({ product, fronhas = [], packageLines = [], packageNote, onAdd, onClose }: {
  product: Product;
  /** Fronhas avulsas do catálogo, para trocar a do jogo. */
  fronhas?: Product[];
  /** O que vem no pacote de cada tamanho (tabela das Configurações). */
  packageLines?: PackageLine[];
  packageNote?: string;
  /** true quando entrou no carrinho (aí a folha fecha), ou a mensagem de erro. */
  onAdd: (variantId: string, opts: SheetAddOptions) => Promise<true | string>;
  onClose: () => void;
}) {
  const isJogo = product.category === 'Jogos de cama';
  const [stock, setStock] = useState<Record<string, number> | null>(null);
  const [chosen, setChosen] = useState(product.variants.length === 1 ? product.variants[0].id : '');
  const [swapSku, setSwapSku] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [photo, setPhoto] = useState(0);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const images = product.images?.length ? product.images : [];
  const titleId = `sheet-${product.id}`;

  useEffect(() => {
    const skus = [
      ...product.variants.map(v => `${product.id}_${v.id}`),
      ...(isJogo ? fronhas.flatMap(f => f.variants.slice(0, 1).map(v => `${f.id}_${v.id}`)) : []),
    ].slice(0, 30).join(',');
    fetch(`/api/stock?skus=${encodeURIComponent(skus)}`)
      .then(r => (r.ok ? r.json() : {}))
      .then(setStock)
      .catch(() => setStock({}));
  }, [product, fronhas, isJogo]);

  const free = (sku: string) => { const n = stock?.[sku]; return n === undefined ? undefined : Math.floor(n); };
  const left = (id: string) => free(`${product.id}_${id}`);
  const variant = product.variants.find(v => v.id === chosen);
  const size = { fronhaCount: product.fronhaCount, variantSize: product.variants[0]?.size };
  const pairsPerUnit = swapPairsPerUnit(size);
  const fronhaOptions = isJogo ? fronhaOptionsFrom(fronhas, sku => stock?.[sku] ?? 99, pairsPerUnit) : [];
  // Quantos dá para levar: estoque da opção e, com a fronha trocada, quantos jogos ela cobre.
  const maxQty = Math.max(1, Math.min(
    MAX_SHARED_QTY,
    variant ? left(variant.id) ?? MAX_SHARED_QTY : MAX_SHARED_QTY,
    swapSku ? Math.floor((stock?.[swapSku] ?? 99) / pairsPerUnit) : MAX_SHARED_QTY,
  ));
  const shownQty = Math.min(qty, maxQty);
  const chosenLeft = variant ? left(variant.id) : undefined;
  const measures = lineForSize(packageLines, variant ? SIZE_LABEL[variant.size] ?? variant.size : undefined);
  const specs = [
    FABRIC_LABEL,
    product.yarnCount && /^\d+\/\d+$/.test(product.yarnCount) ? `Fio ${product.yarnCount}` : '',
    product.weightGsm ? `${product.weightGsm} g/m²` : '',
    ...(product.certifications ?? []),
  ].filter(Boolean);

  return (
    <Overlay onClose={onClose} variant="responsive" labelledBy={titleId}
      className="bg-paper w-full sm:max-w-3xl sm:border sm:border-mist max-h-[92dvh] relative flex flex-col rounded-t-3xl sm:rounded-2xl overflow-hidden">
      {close => (<>
        <button type="button" onClick={close} aria-label="Fechar"
          className="absolute top-3 right-3 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-paper/90 text-ink shadow-sm hover:bg-paper">
          <IconX size={18} />
        </button>

        <div className="overflow-y-auto sm:grid sm:grid-cols-2 sm:items-start">
          {images.length > 0 && (
            <div className="relative sm:sticky sm:top-0">
              <div tabIndex={0} role="region" aria-label={`Fotos de ${product.name}`} className="flex gap-2 overflow-x-auto snap-x focus-visible:outline-2 focus-visible:outline-ink snap-mandatory scroll-px-4 px-4 pt-4 sm:p-0 sm:gap-0 sm:scroll-px-0 scrollbar-none"
                onScroll={e => { const w = (e.currentTarget.firstElementChild as HTMLElement | null)?.offsetWidth ?? 1; setPhoto(Math.min(images.length - 1, Math.round(e.currentTarget.scrollLeft / w))); }}>
                {images.map((src, i) => (
                  <div key={src + i} className="relative shrink-0 w-[72%] sm:w-full aspect-[4/5] snap-start rounded-2xl sm:rounded-none overflow-hidden bg-warm">
                    <Image src={src} alt={i === 0 ? product.name : ''} fill sizes="(min-width: 640px) 384px, 72vw" className="object-cover" priority={i === 0} />
                  </div>
                ))}
              </div>
              {images.length > 1 && (
                <p className="hidden sm:block absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-ink/70 text-paper text-[11px] font-semibold px-2.5 py-1 tabular-nums" aria-hidden="true">
                  {photo + 1} / {images.length}
                </p>
              )}
            </div>
          )}
          <div className="px-5 pt-5 pb-4 flex flex-col gap-5">
            <div>
              <h2 id={titleId} className="font-display text-2xl text-ink leading-tight pr-10">{product.name}</h2>
              <p className="mt-1 text-[15px] font-semibold text-ink tabular-nums">{formatCurrency(product.price)}</p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {specs.map(s => <li key={s} className="rounded-full bg-warm px-2.5 py-1 text-[11px] font-semibold text-mid">{s}</li>)}
              </ul>
              {product.description && (
                <p className="mt-4 text-[14px] text-ink/80 leading-relaxed whitespace-pre-line">{product.description}</p>
              )}
            </div>

            <fieldset>
              <legend className="text-[12px] font-semibold text-mid mb-2">{product.variants.length === 1 ? 'Opção' : 'Escolha a opção'}</legend>
              <div className="flex flex-wrap gap-2">
                {product.variants.map(v => {
                  const n = left(v.id);
                  const out = n !== undefined && n <= 0;
                  const on = chosen === v.id;
                  return (
                    <button key={v.id} type="button" disabled={out} aria-pressed={on} onClick={() => setChosen(v.id)}
                      className={`inline-flex items-center gap-2 min-h-11 pl-2.5 pr-3.5 rounded-full border text-[12.5px] transition-colors disabled:opacity-40 disabled:line-through ${on ? 'border-ink bg-ink text-paper' : 'border-mist text-ink hover:border-ink'}`}>
                      {v.color && /^#/.test(v.color) && <span aria-hidden="true" className="h-4 w-4 rounded-full border border-black/10" style={{ background: v.color }} />}
                      {variantLabel(v)}{out ? ' · esgotado' : ''}
                    </button>
                  );
                })}
              </div>
              {chosenLeft !== undefined && chosenLeft > 0 && chosenLeft <= 3 && (
                <p className="mt-2 text-[12px] font-semibold text-amber-700">Só restam {chosenLeft}</p>
              )}
            </fieldset>

            {measures && <SizeMeasures line={measures} note={packageNote} />}

            {isJogo && fronhaOptions.length > 0 && (
              <FronhaChooser options={fronhaOptions} value={swapSku} onChange={setSwapSku}
                fronhaCount={getFronhaCount(size)} defaultImage={images[0]} />
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-mist shrink-0">
          {error && <p role="alert" className="mb-3 text-[13px] text-red-700">{error}</p>}
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-full border border-mist bg-paper shrink-0" role="group" aria-label="Quantidade">
              <button type="button" onClick={() => setQty(q => Math.max(1, Math.min(q, maxQty) - 1))} disabled={shownQty <= 1}
                aria-label="Diminuir" className="w-11 h-12 text-mid hover:text-ink disabled:opacity-35">−</button>
              <span className="w-7 text-center text-[14px] font-semibold tabular-nums" aria-live="polite">{shownQty}</span>
              <button type="button" onClick={() => setQty(q => Math.min(maxQty, q + 1))} disabled={shownQty >= maxQty}
                aria-label="Aumentar" className="w-11 h-12 text-mid hover:text-ink disabled:opacity-35">+</button>
            </div>
            <button type="button" disabled={!chosen || adding}
              onClick={async () => { setAdding(true); setError(''); const r = await onAdd(chosen, { swapSku, quantity: shownQty }); setAdding(false); if (r === true) close(); else setError(r); }}
              className="flex-1 h-12 rounded-full bg-ink text-paper text-sm font-semibold hover:bg-clay transition-colors disabled:opacity-40">
              {adding ? 'Adicionando…' : chosen ? `Adicionar · ${formatCurrency(product.price * shownQty)}` : 'Escolha uma opção'}
            </button>
          </div>
        </div>
      </>)}
    </Overlay>
  );
}
