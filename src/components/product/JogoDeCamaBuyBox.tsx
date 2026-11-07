'use client';

import { useId, useState } from 'react';
import type { PublicCardFees } from '@/lib/gatewayFees';
import Image from 'next/image';
import { BuyBox } from './BuyBox';
import { getFronhaCount, swapPairsPerUnit } from '@/lib/fronhaSwap';
import type { PackageLine } from '@/lib/packageContents';
import type { Product, InventoryItem } from '@/types';

interface Props {
  product: Product;                  // o Jogo de Cama sendo visto
  inventory: InventoryItem[];
  pixDiscountThresholdCents: number;
  pixDiscountPct: number;
  cardFees?: PublicCardFees;
  fronhaOptions: Product[];          // Fronhas ativas do catálogo, pra trocar a fronha padrão
  fronhaInventory: InventoryItem[];  // estoque dessas fronhas, pra não deixar escolher uma esgotada
  packageLines?: PackageLine[];      // o que vem no pacote de cada tamanho (mostrado embaixo do tamanho)
  packageNote?: string;
}

// Jogos de Cama já vêm com fronha inclusa (fixa). Esse componente deixa o
// cliente escolher, opcionalmente, uma Fronha diferente do catálogo pra
// vir no lugar da padrão. A escolha reserva estoque da fronha trocada de
// verdade (mesma transação da compra, ver expandStockLines em
// create-pix/create-checkout) e fica anotada como `note` no
// carrinho/pedido, pro vendedor ver qual fronha embalar.
//
// IMPORTANTE: a contagem de fronhas é POR PRODUTO (getFronhaCount), não
// um número fixo — solteiro normalmente é 1 fronha, casal/queen/king
// geralmente é 2. O que é enviado aqui é só o valor PROPOSTO — quem
// decide se aceita é o backend (src/lib/fronhaSwap.ts, sanitizeSwaps),
// que rejeita qualquer swapQtyPerUnit diferente do esperado pra ESSE
// produto específico. O carrinho é escrito direto pelo client SDK,
// então nada aqui é confiável sozinho.
export function JogoDeCamaBuyBox({ product, inventory, pixDiscountThresholdCents, pixDiscountPct, cardFees, fronhaOptions, fronhaInventory, packageLines, packageNote }: Props) {
  const [chosenFronhaId, setChosenFronhaId] = useState<string>('default');

  const fronhaCount = getFronhaCount({ fronhaCount: product.fronhaCount, variantSize: product.variants[0]?.size });
  // Estoque da fronha em pares: solteiro usa meio par, casal usa 1.
  const pairsPerUnit = swapPairsPerUnit({ fronhaCount: product.fronhaCount, variantSize: product.variants[0]?.size });

  function availableStock(fronha: Product): number {
    const variant = fronha.variants[0];
    if (!variant) return 0;
    const inv = fronhaInventory.find(i => i.sku === `${fronha.id}_${variant.id}`);
    if (!inv) return 99; // sem controle de estoque cadastrado, assume disponível
    return Math.max(0, inv.quantity - inv.reserved);
  }

  const chosenFronha = fronhaOptions.find(f => f.id === chosenFronhaId);
  const chosenVariant = chosenFronha?.variants[0];
  // note e swapSku sempre juntos ou nenhum dos dois — uma fronha sem
  // nenhuma variante cadastrada (dado incompleto) não pode gerar um aviso
  // de troca sem reserva de estoque correspondente por trás dele.
  const swapSku = chosenFronha && chosenVariant ? `${chosenFronha.id}_${chosenVariant.id}` : undefined;
  const note = swapSku ? `Fronha trocada: ${chosenFronha!.name}` : undefined;
  // Quantos jogos a fronha escolhida cobre: com 2 fronhas por jogo e 3 em
  // estoque, dá pra levar 1 jogo com essa troca.
  const swapMaxQty = chosenFronha ? Math.floor(availableStock(chosenFronha) / pairsPerUnit) : undefined;

  return (
    <div className="flex flex-col gap-4">
      {fronhaOptions.length > 0 && (
        <FronhaPicker
          options={fronhaOptions}
          fronhaCount={fronhaCount}
          chosenId={chosenFronhaId}
          onChoose={setChosenFronhaId}
          stockOf={availableStock}
          pairsPerUnit={pairsPerUnit}
        />
      )}

      <BuyBox
        product={product}
        inventory={inventory}
        pixDiscountThresholdCents={pixDiscountThresholdCents}
        pixDiscountPct={pixDiscountPct}
        cardFees={cardFees}
        note={note}
        swapSku={swapSku}
        swapQtyPerUnit={swapSku ? pairsPerUnit : undefined}
        maxQty={swapSku ? swapMaxQty : undefined}
        packageLines={packageLines}
        packageNote={packageNote}
      />
    </div>
  );
}

/** "Par de Fronhas Azul" no solteiro (1 fronha) vira "Fronha Azul". */
export function fronhaLabel(f: Product, fronhaCount: number): string {
  const color = f.variants[0]?.colorName?.trim();
  const generic = /^\s*(par\s+de\s+)?fronhas?\b/i.test(f.name) && !f.name.replace(/^\s*(par\s+de\s+)?fronhas?\b/i, '').trim();
  // Todas se chamam "Par de Fronhas": a cor é o que diferencia uma da outra.
  const base = generic && color ? color : f.name.replace(/^\s*(par\s+de\s+)?fronhas?\s*/i, '').trim() || color || f.name;
  return `${fronhaCount === 1 ? 'Fronha' : 'Fronhas'} ${base}`.trim();
}

function Swatch({ f, size = 48 }: { f?: Product; size?: number }) {
  const img = f?.images[0];
  const hex = f?.variants[0]?.color;
  return (
    <span className="relative block shrink-0 overflow-hidden rounded-xl bg-warm" style={{ width: size, height: size }}>
      {img ? <Image src={img} alt="" fill className="object-cover" sizes={`${size}px`} />
        : hex ? <span className="absolute inset-0" style={{ background: hex }} />
        : <svg aria-hidden="true" viewBox="0 0 24 24" className="absolute inset-0 m-auto w-1/2 h-1/2 text-mid" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="7" width="18" height="10" rx="3" /><path d="M7 7v10M17 7v10" strokeOpacity=".4" /></svg>}
    </span>
  );
}

/**
 * Troca da fronha em uma linha: mostra a escolhida e, ao tocar em
 * "Trocar", abre uma faixa de miniaturas. Antes era uma lista com um
 * rádio por fronha, todas com o mesmo nome, ocupando meia tela.
 */
function FronhaPicker({ options, fronhaCount, pairsPerUnit, chosenId, onChoose, stockOf }: {
  options: Product[]; fronhaCount: number; pairsPerUnit: number; chosenId: string;
  onChoose: (id: string) => void; stockOf: (f: Product) => number;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const chosen = options.find(o => o.id === chosenId);
  const included = fronhaCount === 1 ? '1 fronha' : `${fronhaCount} fronhas`;

  return (
    <div className="rounded-2xl border border-mist bg-paper">
      <div className="flex items-center gap-3 px-3.5 py-3">
        <Swatch f={chosen} size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint">{fronhaCount === 1 ? 'Fronha do jogo' : `${included} do jogo`}</p>
          <p className="text-[13.5px] text-ink truncate">{chosen ? fronhaLabel(chosen, fronhaCount) : 'Padrão do jogo'}</p>
        </div>
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls={listId}
          className="shrink-0 h-9 px-3.5 rounded-full border border-mist-d text-[12.5px] font-medium text-ink hover:border-ink transition-colors">
          {open ? 'Fechar' : 'Trocar estampa'}
        </button>
      </div>

      {open && (
        <div id={listId} className="border-t border-mist px-3.5 pt-1.5 pb-3.5 animate-measure-in">
          <div role="radiogroup" aria-label="Estampa da fronha" className="-mx-3.5 px-3.5 overflow-x-auto scrollbar-none sm:mx-0 sm:px-0 sm:overflow-visible">
            <div className="flex gap-2.5 w-max pt-2 pb-1 pr-1 sm:w-auto sm:flex-wrap">
              {[undefined, ...options].map(f => {
                const id = f?.id ?? 'default';
                const on = chosenId === id;
                const out = !!f && stockOf(f) < pairsPerUnit;
                const label = f ? fronhaLabel(f, fronhaCount) : 'Padrão do jogo';
                return (
                  <button key={id} type="button" role="radio" aria-checked={on} disabled={out}
                    aria-label={out ? `${label}, esgotada` : label}
                    onClick={() => { onChoose(id); }}
                    className={`group flex w-[4.25rem] flex-col items-center gap-1.5 text-center ${out ? 'opacity-35 cursor-not-allowed' : ''}`}>
                    <span className={`relative rounded-[0.9rem] p-[3px] ring-2 transition-[box-shadow,transform] duration-200 ${on ? 'ring-clay' : 'ring-transparent group-hover:ring-mist-d'}`}>
                      {f ? <Swatch f={f} size={52} /> : (
                        <span className="flex items-center justify-center w-[52px] h-[52px] rounded-xl bg-warm text-[10.5px] font-semibold text-mid">Padrão</span>
                      )}
                      {on && (
                        <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-clay text-paper shadow">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
                        </span>
                      )}
                    </span>
                    <span className={`line-clamp-2 text-[10.5px] leading-tight ${on ? 'text-ink font-medium' : 'text-mid'}`}>
                      {f ? (f.variants[0]?.colorName || label.replace(/^Fronhas?\s*/, '')) : 'do jogo'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-faint">
            {chosen ? 'A fronha escolhida fica reservada junto com sua compra.' : `Escolha uma estampa para vir no lugar ${fronhaCount === 1 ? 'da fronha' : 'das fronhas'} do jogo, sem custo.`}
          </p>
        </div>
      )}
    </div>
  );
}
