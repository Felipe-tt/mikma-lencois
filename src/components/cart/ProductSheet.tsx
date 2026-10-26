'use client';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Overlay } from '@/components/ui/Overlay';
import { IconX } from '@/components/ui/Icon';
import { formatCurrency } from '@/lib/utils/format';
import { variantLabel } from '@/lib/variantLabel';
import { FABRIC_LABEL } from '@/lib/productOptions';
import type { Product } from '@/types';

/**
 * Detalhes do produto sem sair do "Montar junto": fotos, descrição,
 * especificações e a escolha da variação com estoque. Em celular abre
 * como folha de baixo, no computador como janela.
 */
export function ProductSheet({ product, onAdd, onClose }: {
  product: Product;
  /** true quando entrou no carrinho (aí a folha fecha), ou a mensagem de erro. */
  onAdd: (variantId: string) => Promise<true | string>;
  onClose: () => void;
}) {
  const [stock, setStock] = useState<Record<string, number> | null>(null);
  const [chosen, setChosen] = useState(product.variants.length === 1 ? product.variants[0].id : '');
  const [photo, setPhoto] = useState(0);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const images = product.images?.length ? product.images : [];
  const titleId = `sheet-${product.id}`;

  useEffect(() => {
    const skus = product.variants.map(v => `${product.id}_${v.id}`).join(',');
    fetch(`/api/stock?skus=${encodeURIComponent(skus)}`)
      .then(r => (r.ok ? r.json() : {}))
      .then(setStock)
      .catch(() => setStock({}));
  }, [product]);

  const left = (id: string) => stock?.[`${product.id}_${id}`];
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
            <div className="relative">
              <div tabIndex={0} role="region" aria-label={`Fotos de ${product.name}`} className="flex gap-2 overflow-x-auto snap-x focus-visible:outline-2 focus-visible:outline-ink snap-mandatory scroll-px-4 px-4 pt-4 sm:p-0 sm:gap-0 sm:scroll-px-0 [scrollbar-width:none]"
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
          <div className="px-5 pt-5 pb-4">
            <h2 id={titleId} className="font-display text-2xl text-ink leading-tight">{product.name}</h2>
            <p className="mt-1 text-[15px] font-semibold text-ink tabular-nums">{formatCurrency(product.price)}</p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {specs.map(s => <li key={s} className="rounded-full bg-warm px-2.5 py-1 text-[11px] font-semibold text-mid">{s}</li>)}
            </ul>
            {product.description && (
              <p className="mt-4 text-[14px] text-ink/80 leading-relaxed whitespace-pre-line">{product.description}</p>
            )}

            <fieldset className="mt-5">
              <legend className="text-[12px] font-semibold text-mid mb-2">Escolha a opção</legend>
              <div className="flex flex-wrap gap-2">
                {product.variants.map(v => {
                  const n = left(v.id);
                  const out = n !== undefined && n <= 0;
                  return (
                    <button key={v.id} type="button" disabled={out} aria-pressed={chosen === v.id} onClick={() => setChosen(v.id)}
                      className={`min-h-11 px-3.5 rounded-full border text-[12px] transition-colors disabled:opacity-40 disabled:line-through ${chosen === v.id ? 'border-ink bg-ink text-paper' : 'border-mist text-ink hover:border-ink'}`}>
                      {variantLabel(v)}{out ? ' · esgotado' : ''}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-mist shrink-0">
          {error && <p role="alert" className="mb-3 text-[13px] text-red-700">{error}</p>}
          <button type="button" disabled={!chosen || adding}
            onClick={async () => { setAdding(true); setError(''); const r = await onAdd(chosen); setAdding(false); if (r === true) close(); else setError(r); }}
            className="w-full h-12 rounded-full bg-ink text-paper text-sm font-semibold hover:bg-clay transition-colors disabled:opacity-40">
            {adding ? 'Adicionando…' : chosen ? 'Adicionar ao carrinho' : 'Escolha uma opção'}
          </button>
        </div>
      </>)}
    </Overlay>
  );
}
