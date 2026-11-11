'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/db';
import { formatCurrency, formatDateTime } from '@/lib/utils/format';

interface Estorno { status: 'processando' | 'feito' | 'falhou'; cents: number; via?: 'abacatepay' | 'pix' | 'fora'; at?: string; receiptUrl?: string }
interface Devolucao { id: string; type: 'troca' | 'devolucao'; status: string; estorno?: Estorno }

const COMO: Record<string, string> = {
  abacatepay: 'estorno pela AbacatePay',
  pix: 'PIX no CPF do cliente',
  fora: 'devolvido por fora',
};

/**
 * Pedido no painel: todo dinheiro que voltou (ou está voltando) para o
 * cliente, com valor, jeito e data. Estorno de cancelamento, devoluções e
 * diferenças de troca aparecem juntos, com o total no fim.
 */
export function DinheiroDevolvido({ order }: {
  order: { id: string; totalCents: number; status: string; payment: { refundStatus?: string; refundedAt?: string | null; refundForReturn?: string } };
}) {
  const [devolucoes, setDevolucoes] = useState<Devolucao[]>([]);
  useEffect(() => onSnapshot(
    query(collection(db, 'returns'), where('orderId', '==', order.id)),
    s => setDevolucoes(s.docs.map(d => ({ id: d.id, ...d.data() }) as Devolucao)),
    () => {},
  ), [order.id]);

  const linhas: { key: string; cents: number; titulo: string; detalhe: string; tom: 'ok' | 'andamento' | 'erro'; comprovante?: string }[] = [];
  // Estorno do cancelamento (o de devolução aparece pela própria devolução).
  if (order.payment.refundStatus === 'done' && !order.payment.refundForReturn) {
    linhas.push({ key: 'cancel', cents: order.totalCents, titulo: 'Estorno do pedido', detalhe: `estorno pela AbacatePay${order.payment.refundedAt ? ` · ${formatDateTime(order.payment.refundedAt)}` : ''}`, tom: 'ok' });
  }
  for (const d of devolucoes) {
    const e = d.estorno;
    if (!e) continue;
    const titulo = d.type === 'troca' ? 'Diferença da troca' : 'Devolução';
    if (e.status === 'feito') linhas.push({ key: d.id, cents: e.cents, titulo, detalhe: `${COMO[e.via ?? 'fora']}${e.at ? ` · ${formatDateTime(e.at)}` : ''}`, tom: 'ok', comprovante: e.receiptUrl });
    else if (e.status === 'processando') linhas.push({ key: d.id, cents: e.cents, titulo, detalhe: 'em andamento na AbacatePay', tom: 'andamento' });
    else linhas.push({ key: d.id, cents: e.cents, titulo, detalhe: 'o banco recusou o PIX: devolva por fora em Trocas', tom: 'erro' });
  }
  if (!linhas.length) return null;
  const total = linhas.filter(l => l.tom === 'ok').reduce((s, l) => s + l.cents, 0);

  return (
    <section aria-label="Dinheiro devolvido ao cliente" className="border border-mist bg-paper px-5 py-4 rounded-2xl flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-faint">Dinheiro devolvido ao cliente</p>
        <Link href="/painel/trocas" className="text-[12px] text-clay hover:text-clay-d">Trocas</Link>
      </div>
      <ul className="flex flex-col divide-y divide-mist">
        {linhas.map(l => (
          <li key={l.key} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-ink">{l.titulo}</p>
              <p className={`text-[12px] ${l.tom === 'erro' ? 'text-red-600' : l.tom === 'andamento' ? 'text-amber-700' : 'text-mid'}`}>
                {l.detalhe}
                {l.comprovante && <> · <a href={l.comprovante} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">comprovante</a></>}
              </p>
            </div>
            <span className={`text-[14px] font-bold tabular-nums shrink-0 ${l.tom === 'ok' ? 'text-ink' : 'text-faint'}`}>{formatCurrency(l.cents)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between border-t border-mist pt-2">
        <span className="text-[12.5px] text-mid">Total devolvido</span>
        <span className="text-[16px] font-bold text-ink tabular-nums">{formatCurrency(total)}</span>
      </div>
    </section>
  );
}
