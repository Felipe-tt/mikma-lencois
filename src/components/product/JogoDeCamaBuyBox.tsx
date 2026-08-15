'use client';

import { useState } from 'react';
import Image from 'next/image';
import { BuyBox } from './BuyBox';
import type { Product, InventoryItem } from '@/types';

interface Props {
  product: Product;             // o Jogo de Cama sendo visto
  inventory: InventoryItem[];
  pixDiscountThresholdCents: number;
  pixDiscountPct: number;
  fronhaOptions: Product[];     // Fronhas ativas do catálogo, pra trocar a fronha padrão
}

// Jogos de Cama já vêm com fronha inclusa (fixa). Esse componente deixa o
// cliente escolher, opcionalmente, uma Fronha diferente do catálogo pra
// vir no lugar da padrão — anotado como `note` no item do carrinho/pedido
// pro vendedor separar na hora de embalar. Não mexe em estoque da fronha
// escolhida (é uma troca dentro do mesmo Jogo de Cama, não uma compra
// avulsa), o vendedor confirma disponibilidade manualmente.
export function JogoDeCamaBuyBox({ product, inventory, pixDiscountThresholdCents, pixDiscountPct, fronhaOptions }: Props) {
  const [chosenFronhaId, setChosenFronhaId] = useState<string>('default');

  const chosenFronha = fronhaOptions.find(f => f.id === chosenFronhaId);
  const note = chosenFronha ? `Fronha trocada: ${chosenFronha.name}` : undefined;

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

          {fronhaOptions.map(f => (
            <label key={f.id} className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="fronha"
                checked={chosenFronhaId === f.id}
                onChange={() => setChosenFronhaId(f.id)}
                className="w-4 h-4 accent-clay shrink-0"
              />
              {f.images[0] && (
                <div className="relative w-9 h-9 shrink-0 bg-warm/60">
                  <Image src={f.images[0]} alt={f.name} fill className="object-cover" sizes="36px" />
                </div>
              )}
              <span className="text-[13px] text-ink">{f.name}</span>
            </label>
          ))}

          {chosenFronha && (
            <p className="text-[11px] text-faint">
              Sua troca fica anotada no pedido pra gente confirmar disponibilidade antes de embalar.
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
      />
    </div>
  );
}
