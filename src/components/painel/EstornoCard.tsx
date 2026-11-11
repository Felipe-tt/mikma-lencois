'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/db';
import { auth } from '@/lib/firebase/client';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { cobrancaAbacate, valorDaDevolucao, type PedidoParaEstorno } from '@/lib/returns/estorno';
import { formatCurrency } from '@/lib/utils/format';

export interface EstornoView {
  status: 'processando' | 'feito' | 'falhou';
  cents: number;
  via?: 'abacatepay' | 'pix' | 'fora';
  at?: string;
  receiptUrl?: string;
  motivo?: string;
}

async function chamar(returnId: string, method: 'POST' | 'GET', modo?: 'abacatepay' | 'fora'): Promise<{ error: string | null; estorno?: EstornoView | null }> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) return { error: 'Sua sessão expirou. Entre de novo.' };
  try {
    const res = await fetch(`/api/painel/trocas/${returnId}/estorno`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(modo ? { 'Content-Type': 'application/json' } : {}) },
      ...(modo ? { body: JSON.stringify({ modo }) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { error: null, estorno: data.estorno } : { error: data.error ?? 'Não foi possível devolver o dinheiro agora.' };
  } catch {
    return { error: 'Sem conexão. Tente de novo.' };
  }
}

/** Pede a devolução do dinheiro de uma troca ou devolução já conferida. Devolve a mensagem de erro, se houver. */
export async function pedirEstorno(returnId: string, modo: 'abacatepay' | 'fora'): Promise<string | null> {
  return (await chamar(returnId, 'POST', modo)).error;
}

/**
 * Dinheiro de uma devolução (ou da sobra de uma troca) depois de conferir as
 * peças. A AbacatePay devolve sozinha: estorno do pedido inteiro, ou PIX
 * para o CPF do cliente quando é só uma parte. "Já devolvi" fica para
 * quando o PIX não puder sair (cliente sem chave no CPF).
 */
export function EstornoCard({ returnId, orderId, items, estorno, diferencaCents }: {
  returnId: string;
  orderId: string;
  items: { sku: string; quantity: number }[];
  estorno?: EstornoView;
  /** Troca por peça mais barata: valor que sobra para devolver. */
  diferencaCents?: number;
}) {
  const [order, setOrder] = useState<PedidoParaEstorno | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conferido, setConferido] = useState<EstornoView | null>(null);

  useEffect(() => {
    if (estorno?.status === 'feito') return;
    getDoc(doc(db, 'orders', orderId)).then(s => setOrder((s.data() as PedidoParaEstorno | undefined) ?? null)).catch(() => {});
  }, [orderId, estorno?.status]);

  // PIX enviado pode ser recusado depois pelo banco: confere uma vez.
  useEffect(() => {
    if (estorno?.status !== 'feito' || estorno.via !== 'pix') return;
    chamar(returnId, 'GET').then(r => { if (r.estorno) setConferido(r.estorno); }).catch(() => {});
  }, [returnId, estorno?.status, estorno?.via]);

  const atual = conferido ?? estorno;

  if (atual?.status === 'feito') {
    const como = atual.via === 'abacatepay' ? 'pela AbacatePay (estorno)' : atual.via === 'pix' ? 'por PIX no CPF do cliente, pela AbacatePay' : 'por fora';
    return (
      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex flex-col gap-1">
        <p className="text-[13px] text-emerald-800">{formatCurrency(atual.cents)} devolvidos {como}. O cliente recebeu um e-mail.</p>
        {atual.receiptUrl && <a href={atual.receiptUrl} target="_blank" rel="noopener noreferrer" className="self-start text-[12px] font-semibold text-emerald-800 underline underline-offset-2">Ver comprovante</a>}
      </div>
    );
  }
  if (!order) return null;

  const valor = diferencaCents ? { cents: diferencaCents, inteira: false } : valorDaDevolucao(order, items);
  const estornoTotal = !diferencaCents && valor.inteira && cobrancaAbacate(order.payment).ok;

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
        {atual?.status === 'processando'
          ? `Devolução de ${formatCurrency(valor.cents)} em andamento na AbacatePay.`
          : atual?.status === 'falhou'
            ? atual.motivo ?? 'O PIX não chegou ao cliente. Devolva por fora e registre.'
            : estornoTotal
              ? `${formatCurrency(valor.cents)} voltam para o cliente pela AbacatePay, no mesmo meio do pagamento.`
              : `${formatCurrency(valor.cents)} voltam para o cliente por PIX, no CPF dele, pela AbacatePay.`}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {atual?.status !== 'processando' && atual?.status !== 'falhou' && (
          <button type="button" onClick={() => devolver('abacatepay')} disabled={busy}
            className="bg-ink text-paper text-[11px] font-bold uppercase tracking-wide px-3.5 py-2 hover:bg-ink/80 transition-colors disabled:opacity-50 rounded-full">
            {busy ? 'Devolvendo…' : `Devolver ${formatCurrency(valor.cents)}`}
          </button>
        )}
        <button type="button" onClick={() => devolver('fora')} disabled={busy}
          className="text-[12px] text-mid underline underline-offset-2 hover:text-ink disabled:opacity-50">
          Já devolvi por fora
        </button>
      </div>
      {error && <p role="alert" className="text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
