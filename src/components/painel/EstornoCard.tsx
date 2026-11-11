'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/db';
import { auth } from '@/lib/firebase/client';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { cobrancaAbacate, valorDaDevolucao, type PedidoParaEstorno } from '@/lib/returns/estorno';
import { formatCurrency } from '@/lib/utils/format';

export interface EstornoView { status: 'processando' | 'feito'; cents: number; via?: 'abacatepay' | 'fora'; at?: string }

/** Pede o estorno de uma devolução já conferida. Devolve a mensagem de erro, se houver. */
export async function pedirEstorno(returnId: string, modo: 'abacatepay' | 'fora'): Promise<string | null> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) return 'Sua sessão expirou. Entre de novo.';
  try {
    const res = await fetch(`/api/painel/trocas/${returnId}/estorno`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ modo }),
    });
    if (res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return data.error ?? 'Não foi possível devolver o dinheiro agora.';
  } catch {
    return 'Sem conexão. Tente de novo.';
  }
}

/**
 * Dinheiro de uma devolução concluída: estornado pela AbacatePay (pedido
 * todo), ou devolvido por PIX pela equipe (parte do pedido ou pago por fora).
 */
export function EstornoCard({ returnId, orderId, items, estorno }: {
  returnId: string;
  orderId: string;
  items: { sku: string; quantity: number }[];
  estorno?: EstornoView;
}) {
  const [order, setOrder] = useState<PedidoParaEstorno | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (estorno?.status === 'feito') return;
    getDoc(doc(db, 'orders', orderId)).then(s => setOrder((s.data() as PedidoParaEstorno | undefined) ?? null)).catch(() => {});
  }, [orderId, estorno?.status]);

  if (estorno?.status === 'feito') {
    return (
      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <p className="text-[13px] text-emerald-800">
          {formatCurrency(estorno.cents)} devolvidos {estorno.via === 'abacatepay' ? 'pela AbacatePay' : 'por fora'}. O cliente recebeu um e-mail.
        </p>
      </div>
    );
  }
  if (!order) return null;

  const valor = valorDaDevolucao(order, items);
  const pelaAbacate = valor.inteira && cobrancaAbacate(order.payment).ok;

  async function devolver(modo: 'abacatepay' | 'fora') {
    if (modo === 'fora') {
      const { confirmed } = await confirmDialog({
        message: `Já devolveu ${formatCurrency(valor.cents)} ao cliente?`,
        detail: 'Registra a devolução do dinheiro e avisa o cliente por e-mail.',
        confirmLabel: 'Já devolvi',
      });
      if (!confirmed) return;
    }
    setBusy(true); setError('');
    const err = await pedirEstorno(returnId, modo);
    if (err) setError(err);
    setBusy(false);
  }

  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col gap-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-800">Dinheiro a devolver</p>
      <p className="text-[13px] text-ink">
        {estorno?.status === 'processando'
          ? `Estorno de ${formatCurrency(valor.cents)} em andamento na AbacatePay.`
          : pelaAbacate
            ? `${formatCurrency(valor.cents)} voltam para o cliente pela AbacatePay, no mesmo meio do pagamento.`
            : `Faça um PIX de ${formatCurrency(valor.cents)} para o cliente${valor.inteira ? '' : ' (só as peças devolvidas: a AbacatePay estorna apenas o pedido inteiro)'} e registre aqui.`}
      </p>
      <div className="flex flex-wrap gap-2">
        {pelaAbacate && estorno?.status !== 'processando' && (
          <button type="button" onClick={() => devolver('abacatepay')} disabled={busy}
            className="bg-ink text-paper text-[11px] font-bold uppercase tracking-wide px-3.5 py-2 hover:bg-ink/80 transition-colors disabled:opacity-50 rounded-full">
            {busy ? 'Estornando…' : `Devolver ${formatCurrency(valor.cents)}`}
          </button>
        )}
        {!pelaAbacate && (
          <button type="button" onClick={() => devolver('fora')} disabled={busy}
            className="border border-ink text-ink text-[11px] font-bold uppercase tracking-wide px-3.5 py-2 hover:bg-ink hover:text-paper transition-colors disabled:opacity-50 rounded-full">
            Já devolvi
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
