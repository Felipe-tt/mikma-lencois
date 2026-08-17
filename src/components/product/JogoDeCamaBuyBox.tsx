'use client';

import { useState } from 'react';
import Image from 'next/image';
import { BuyBox } from './BuyBox';
import type { Product, InventoryItem } from '@/types';

interface Props {
  product: Product;                  // o Jogo de Cama sendo visto
  inventory: InventoryItem[];
  pixDiscountThresholdCents: number;
  pixDiscountPct: number;
  fronhaOptions: Product[];          // Fronhas ativas do catálogo, pra trocar a fronha padrão
  fronhaInventory: InventoryItem[];  // estoque dessas fronhas, pra não deixar escolher uma esgotada
}

// Todos os 3 Jogos de Cama hoje são queen com 2 fronhas cada. Se um jogo
// diferente (ex: solteiro, 1 fronha) for cadastrado no futuro, esse valor
// fixo vai reservar fronha a mais/a menos — ajustar aqui se isso mudar.
const FRONHAS_POR_JOGO = 2;

// Jogos de Cama já vêm com fronha inclusa (fixa). Esse componente deixa o
// cliente escolher, opcionalmente, uma Fronha diferente do catálogo pra
// vir no lugar da padrão. A escolha reserva estoque da fronha trocada de
// verdade (mesma transação da compra, ver expandStockLines em
// create-pix/create-checkout) e fica anotada como `note` no
// carrinho/pedido, pro vendedor ver qual fronha embalar.
export function JogoDeCamaBuyBox({ product, inventory, pixDiscountThresholdCents, pixDiscountPct, fronhaOptions, fronhaInventory }: Props) {
  const [chosenFronhaId, setChosenFronhaId] = useState<string>('default');

  function availableStock(fronha: Product): number {
    const variant = fronha.variants[0];
    if (!variant) return 0;
    const inv = fronhaInventory.find(i => i.sku === `${fronha.id}_${variant.id}`);
    if (!inv) return 99; // sem controle de estoque cadastrado, assume disponível
    return Math.max(0, inv.quantity - inv.reserved);
  }

  const chosenFronha = fronhaOptions.find(f => f.id === chosenFronhaId);
  const chosenVariant = chosenFronha?.variants[0];
  const note = chosenFronha ? `Fronha trocada: ${chosenFronha.name}` : undefined;
  const swapSku = chosenFronha && chosenVariant ? `${chosenFronha.id}_${chosenVariant.id}` : undefined;

  return (
    <div className="flex flex-col gap-4">
      {fronhaOptions.length > 0 && (
        <div className="border border-mist p-5 flex flex-col gap-3">
          <div>
            <p className="eyebrow text-clay mb-1">Fronha</p>
            <p className="text-[13px] text-faint">Esse jogo vem com fronha inclusa. Quer trocar por outra estampa?</p>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="radio"
              name="fronha"
              checked={chosenFronhaId === 'default'}
              onChange={() => setChosenFronhaId('default')}
              className="w-4 h-4 accent-clay shrink-0"
            />
            <span className="text-[13px] text-ink">Fronha padrão (a que já vem no jogo)</span>
          </label>

          {fronhaOptions.map(f => {
            const stock = availableStock(f);
            const outOfStock = stock < FRONHAS_POR_JOGO;
            return (
              <label
                key={f.id}
                className={`flex items-center gap-2.5 ${outOfStock ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <input
                  type="radio"
                  name="fronha"
                  checked={chosenFronhaId === f.id}
                  disabled={outOfStock}
                  onChange={() => setChosenFronhaId(f.id)}
                  className="w-4 h-4 accent-clay shrink-0"
                />
                {f.images[0] && (
                  <div className="relative w-9 h-9 shrink-0 bg-warm/60">
                    <Image src={f.images[0]} alt={f.name} fill className="object-cover" sizes="36px" />
                  </div>
                )}
                <span className="text-[13px] text-ink">{f.name}</span>
                {outOfStock && <span className="text-[11px] text-faint">esgotada</span>}
              </label>
            );
          })}

          {chosenFronha && (
            <p className="text-[11px] text-faint">
              A fronha escolhida fica reservada junto com sua compra.
            </p>
          )}
        </div>
      )}

      <BuyBox
        product={product}
        inventory={inventory}
        pixDiscountThresholdCents={pixDiscountThresholdCents}
        pixDiscountPct={pixDiscountPct}
        note={note}
        swapSku={swapSku}
        swapQty={swapSku ? FRONHAS_POR_JOGO : undefined}
      />
    </div>
  );
}
