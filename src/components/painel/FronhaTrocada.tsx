'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/db';
import { variantLabel } from '@/lib/variantLabel';

interface FronhaInfo { name: string; image?: string; variant?: { size?: string; fabric?: string; color?: string; colorName?: string } }

/**
 * A fronha que o cliente escolheu no lugar da que vem no jogo: foto, nome,
 * estampa/cor, quantas fronhas separar e o código (SKU) do estoque. Antes
 * só aparecia "Fronha trocada: Fronhas Estampado", e com várias estampas
 * de mesmo nome não dava para saber qual embalar.
 */
export function FronhaTrocada({ item, compacta = false }: {
  item: { swapSku?: string; swapImage?: string; swapQtyPerUnit?: number; quantity: number; note?: string };
  /** Versão para a nota de separação impressa (sem fundo colorido). */
  compacta?: boolean;
}) {
  const [info, setInfo] = useState<FronhaInfo | null>(null);
  const sku = item.swapSku;
  useEffect(() => {
    if (!sku) return;
    const [productId, variantId] = [sku.slice(0, sku.indexOf('_')), sku.slice(sku.indexOf('_') + 1)];
    getDoc(doc(db, 'products', productId)).then(s => {
      const p = s.data() as { name?: string; images?: string[]; variants?: (FronhaInfo['variant'] & { id: string })[] } | undefined;
      if (!p) return;
      setInfo({ name: p.name ?? '', image: p.images?.[0], variant: p.variants?.find(v => v.id === variantId) });
    }).catch(() => {});
  }, [sku]);

  if (!sku) return item.note ? <p className="text-[11px] text-clay font-medium mt-1">{item.note}</p> : null;
  // Estoque da fronha é em pares; o jogo leva swapQtyPerUnit pares por unidade.
  const fronhas = Math.round((item.swapQtyPerUnit ?? 1) * 2 * item.quantity);
  const image = item.swapImage || info?.image;
  const detalhe = info?.variant ? variantLabel(info.variant) : '';

  return (
    <div className={`mt-2 flex items-center gap-3 rounded-lg ${compacta ? 'border border-neutral-400 px-2 py-1.5' : 'border border-clay/40 bg-clay/5 px-3 py-2'}`}>
      {image && (
        <img src={image} alt={`Fronha escolhida: ${info?.name ?? sku}`} width={44} height={44}
          className="w-11 h-11 rounded-md object-cover border border-mist shrink-0" />
      )}
      <div className="min-w-0">
        <p className={`text-[10px] font-bold uppercase tracking-[0.1em] ${compacta ? 'text-neutral-600' : 'text-clay'}`}>Trocar a fronha do jogo por</p>
        <p className="text-[13px] font-semibold text-ink leading-snug">
          {fronhas} {fronhas === 1 ? 'fronha' : 'fronhas'} · {info?.name ?? item.note?.replace(/^Fronha trocada:\s*/i, '') ?? 'fronha escolhida'}
          {detalhe && <span className="font-normal text-mid"> · {detalhe}</span>}
        </p>
        <p className="text-[10.5px] font-mono text-faint">SKU: {sku}</p>
      </div>
    </div>
  );
}
