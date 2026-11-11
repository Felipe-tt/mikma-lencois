'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/db';
import { variantLabel } from '@/lib/variantLabel';
import { formatCurrency } from '@/lib/utils/format';
import type { Order, Product } from '@/types';

export interface NovaEscolhida { no: string; productId: string; variantId: string; quantity: number }
export interface Cotacao { diferencaCents: number; freteCents: number; saldoCents: number; freteLabel: string }

/**
 * Troca: a peça que o cliente quer no lugar de cada uma que devolve, e o
 * que isso custa (diferença de preço e frete do novo envio) ou devolve.
 * Defeito: a mesma peça, sem custo.
 */
export function NovasPecas({ order, qty, defeito, getToken, onChange }: {
  order: Order;
  qty: Record<string, number>;
  defeito: boolean;
  getToken: () => Promise<string>;
  onChange: (v: { novos: NovaEscolhida[]; cotacao: Cotacao | null; pronto: boolean }) => void;
}) {
  const [produtos, setProdutos] = useState<Product[] | null>(null);
  const [escolha, setEscolha] = useState<Record<string, { productId: string; variantId: string }>>(() =>
    Object.fromEntries(order.items.map(i => [i.sku, { productId: i.productId, variantId: i.variant.id }])));
  const [cotacao, setCotacao] = useState<Cotacao | null>(null);
  const [cotando, setCotando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (defeito) return;
    getDocs(query(collection(db, 'products'), where('active', '==', true)))
      .then(s => setProdutos(s.docs.map(d => ({ ...(d.data() as Product), id: d.id }))))
      .catch(() => setProdutos([]));
  }, [defeito]);

  const linhas = order.items.filter(i => (qty[i.sku] ?? 0) > 0);
  const novos: NovaEscolhida[] = useMemo(() => linhas.map(i => ({
    no: i.sku, productId: escolha[i.sku]?.productId ?? i.productId, variantId: escolha[i.sku]?.variantId ?? i.variant.id, quantity: qty[i.sku],
  })), [linhas, escolha, qty]);
  const chave = JSON.stringify(novos);

  // Cotação no servidor: preço da peça nova e frete até o endereço do pedido.
  useEffect(() => {
    if (defeito) { onChange({ novos: novos.map(n => ({ ...n, productId: order.items.find(i => i.sku === n.no)!.productId, variantId: order.items.find(i => i.sku === n.no)!.variant.id })), cotacao: null, pronto: true }); return; }
    if (!novos.length) { setCotacao(null); onChange({ novos, cotacao: null, pronto: false }); return; }
    let vivo = true;
    setCotando(true); setErro(''); onChange({ novos, cotacao: null, pronto: false });
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/orders/${order.id}/troca/cotacao`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getToken()}` },
          body: JSON.stringify({ items: novos.map(n => ({ sku: n.no, quantity: n.quantity })), novos }),
        });
        const data = await res.json().catch(() => ({}));
        if (!vivo) return;
        if (!res.ok) { setErro(data.error ?? 'Não deu para calcular agora.'); setCotacao(null); onChange({ novos, cotacao: null, pronto: false }); return; }
        setCotacao(data); onChange({ novos, cotacao: data, pronto: true });
      } catch {
        if (vivo) setErro('Sem conexão para calcular o valor.');
      } finally { if (vivo) setCotando(false); }
    }, 350);
    return () => { vivo = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, defeito]);

  if (!linhas.length) return null;

  if (defeito) {
    return (
      <p className="rounded-xl bg-warm/60 px-3 py-2.5 text-[12.5px] text-mid">
        Você recebe a mesma peça, nova. O envio é por nossa conta.
      </p>
    );
  }

  const original = (sku: string) => order.items.find(i => i.sku === sku)!;
  const categoria = (productId: string) => produtos?.find(p => p.id === productId)?.category;

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[12px] font-semibold text-mid">Trocar por</span>
      {linhas.map(i => {
        const atual = escolha[i.sku];
        const cat = categoria(i.productId);
        const opcoes = (produtos ?? []).filter(p => !cat || p.category === cat);
        const prod = produtos?.find(p => p.id === atual.productId);
        return (
          <div key={i.sku} className="rounded-xl border border-mist p-3 flex flex-col gap-2">
            <p className="text-[11.5px] text-faint">No lugar de: {original(i.sku).productName} · {variantLabel(original(i.sku).variant)}</p>
            <select aria-label={`Peça nova no lugar de ${i.productName}`} value={atual.productId} disabled={!produtos}
              onChange={e => {
                const p = produtos?.find(x => x.id === e.target.value);
                setEscolha(s => ({ ...s, [i.sku]: { productId: e.target.value, variantId: p?.variants[0]?.id ?? '' } }));
              }}
              className="h-11 w-full min-w-0 truncate rounded-lg border border-mist bg-paper px-3 text-[14px] text-ink">
              {!produtos && <option>Carregando…</option>}
              {opcoes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {prod && <p className="text-[12px] text-mid tabular-nums">{formatCurrency(prod.price)} cada</p>}
            {prod && prod.variants.length > 1 && (
              <select aria-label={`Tamanho e cor da peça nova no lugar de ${i.productName}`} value={atual.variantId}
                onChange={e => setEscolha(s => ({ ...s, [i.sku]: { ...s[i.sku], variantId: e.target.value } }))}
                className="h-11 w-full min-w-0 truncate rounded-lg border border-mist bg-paper px-3 text-[14px] text-ink">
                {prod.variants.map(v => <option key={v.id} value={v.id}>{variantLabel(v)}</option>)}
              </select>
            )}
          </div>
        );
      })}
      <div className="rounded-xl bg-warm/60 px-3 py-2.5 text-[12.5px] text-mid flex flex-col gap-0.5" aria-live="polite">
        {cotando || !cotacao ? (
          <span>{erro || 'Calculando o valor…'}</span>
        ) : (
          <>
            {cotacao.diferencaCents !== 0 && (
              <span className="flex justify-between"><span>Diferença de preço</span><span className="tabular-nums">{cotacao.diferencaCents > 0 ? '+ ' : '- '}{formatCurrency(Math.abs(cotacao.diferencaCents))}</span></span>
            )}
            <span className="flex justify-between"><span>Frete do novo envio ({cotacao.freteLabel})</span><span className="tabular-nums">{formatCurrency(cotacao.freteCents)}</span></span>
            <span className="flex justify-between text-ink font-semibold pt-1">
              <span>{cotacao.saldoCents > 0 ? 'Você paga por PIX' : cotacao.saldoCents < 0 ? 'Você recebe de volta' : 'Total'}</span>
              <span className="tabular-nums">{formatCurrency(Math.abs(cotacao.saldoCents))}</span>
            </span>
            <span className="text-[11px] text-faint">A volta das peças é por nossa conta. {cotacao.saldoCents > 0 ? 'O PIX é gerado quando a troca for aprovada.' : ''}</span>
          </>
        )}
      </div>
    </div>
  );
}
