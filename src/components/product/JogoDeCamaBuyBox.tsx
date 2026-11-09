'use client';

import { useState } from 'react';
import type { PublicCardFees } from '@/lib/gatewayFees';
import { BuyBox } from './BuyBox';
import { FronhaChooser, fronhaOptionsFrom } from './FronhaChooser';
import { fronhaDisplayName, getFronhaCount, swapPairsPerUnit } from '@/lib/fronhaSwap';
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
  const [swapSku, setSwapSku] = useState<string | null>(null);

  const fronhaCount = getFronhaCount({ fronhaCount: product.fronhaCount, variantSize: product.variants[0]?.size });
  // Estoque da fronha em pares: solteiro usa meio par, casal usa 1.
  const pairsPerUnit = swapPairsPerUnit({ fronhaCount: product.fronhaCount, variantSize: product.variants[0]?.size });

  function freeStock(sku: string): number {
    const inv = fronhaInventory.find(i => i.sku === sku);
    if (!inv) return 99; // sem controle de estoque cadastrado, assume disponível
    return Math.max(0, inv.quantity - inv.reserved);
  }

  const options = fronhaOptionsFrom(fronhaOptions, freeStock, pairsPerUnit);
  const chosenFronha = swapSku ? fronhaOptions.find(f => swapSku.startsWith(`${f.id}_`)) : undefined;
  // note e swapSku sempre juntos ou nenhum dos dois.
  const note = chosenFronha ? `Fronha trocada: ${fronhaLabel(chosenFronha, fronhaCount)}` : undefined;
  // Quantos jogos a fronha escolhida cobre: com 2 fronhas por jogo e 3 em
  // estoque, dá pra levar 1 jogo com essa troca.
  const swapMaxQty = swapSku ? Math.floor(freeStock(swapSku) / pairsPerUnit) : undefined;

  return (
    <div className="flex flex-col gap-4">
      {options.length > 0 && (
        <FronhaChooser
          options={options}
          value={chosenFronha ? swapSku : null}
          onChange={setSwapSku}
          fronhaCount={fronhaCount}
          defaultImage={product.images[0]}
        />
      )}

      <BuyBox
        product={product}
        inventory={inventory}
        pixDiscountThresholdCents={pixDiscountThresholdCents}
        pixDiscountPct={pixDiscountPct}
        cardFees={cardFees}
        note={note}
        swapSku={chosenFronha ? swapSku ?? undefined : undefined}
        swapImage={chosenFronha ? chosenFronha.images[0] : undefined}
        swapQtyPerUnit={chosenFronha ? pairsPerUnit : undefined}
        maxQty={chosenFronha ? swapMaxQty : undefined}
        packageLines={packageLines}
        packageNote={packageNote}
      />
    </div>
  );
}

/** "Par de Fronhas Azul" no solteiro (1 fronha) vira "Fronha Azul". */
export function fronhaLabel(f: Product, fronhaCount: number): string {
  return fronhaDisplayName({ name: f.name, colorName: f.variants[0]?.colorName }, fronhaCount);
}
