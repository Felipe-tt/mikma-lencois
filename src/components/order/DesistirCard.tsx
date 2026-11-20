'use client';

import { useState } from 'react';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { formatCurrency, formatTsDateTime } from '@/lib/utils/format';
import type { Order } from '@/types';

/**
 * "Desistir da compra" no pedido pago que ainda não chegou (CDC, art. 49;
 * Decreto 7.962/2013, art. 5º). O cliente pede aqui, recebe a confirmação
 * por e-mail na hora, e a equipe cancela e devolve o dinheiro.
 */
export function DesistirCard({ order, user }: {
  order: Order;
  user: { getIdToken: () => Promise<string> };
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const saiu = order.status === 'shipped';
  const total = formatCurrency(order.totalCents);

  // Desistiu por engano: tira o pedido de desistência (antes de cancelar).
  async function manter() {
    const ok = await confirmDialog({ message: 'Manter o pedido?', detail: 'O pedido segue normalmente para a entrega.', confirmLabel: 'Manter o pedido' });
    if (!ok) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch(`/api/orders/${order.id}/desistir`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? 'Não foi possível agora. Tente de novo.');
    } catch {
      setError('Erro de conexão. Verifique sua internet e tente de novo.');
    } finally {
      setSending(false);
    }
  }

  async function desistir() {
    const ok = await confirmDialog({
      message: 'Desistir da compra?',
      detail: `Vamos cancelar o pedido e devolver ${total}, frete incluso, pelo mesmo meio de pagamento.${saiu ? ' O pedido já saiu: se ele chegar, você pode recusar o recebimento.' : ''}`,
      confirmLabel: 'Desistir da compra',
      variant: 'danger',
    });
    if (!ok) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch(`/api/orders/${order.id}/desistir`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const data = await res.json().catch(() => ({}));
      // Deu certo: o pedido (ao vivo na página) passa a mostrar o aviso abaixo.
      if (!res.ok) setError(data.error ?? 'Não foi possível enviar agora. Tente de novo.');
    } catch {
      setError('Erro de conexão. Verifique sua internet e tente de novo.');
    } finally {
      setSending(false);
    }
  }

  if (order.cancelRequest) {
    return (
      <section role="status" className="rounded-2xl border border-clay/30 bg-clay/5 p-5">
        <h2 className="font-display font-normal text-ink text-[1.15rem] leading-tight mb-2">Você pediu para desistir</h2>
        <p className="text-[13px] text-mid leading-relaxed">
          Recebemos o pedido em {formatTsDateTime(order.cancelRequest.at)}. Vamos cancelar e devolver {total}; você recebe um e-mail quando o cancelamento for feito.
          {saiu && ' O pedido já saiu: se ele chegar, você pode recusar o recebimento.'}
        </p>
        <button onClick={manter} disabled={sending}
          className="mt-2 inline-flex items-center min-h-10 text-[12.5px] font-semibold text-clay hover:text-clay-d underline underline-offset-2 disabled:opacity-50 transition-colors">
          {sending ? 'Enviando…' : 'Desistiu por engano? Manter o pedido'}
        </button>
        {error && <p role="alert" className="text-[12px] text-red-600 mt-1">{error}</p>}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-mist p-5">
      <h2 className="font-display font-normal text-ink text-[1.15rem] leading-tight mb-2">Mudou de ideia?</h2>
      <p className="text-[13px] text-mid leading-relaxed mb-3">
        Você pode desistir da compra, sem custo, até 7 dias depois de receber. Se ainda não chegou, é só pedir aqui.
      </p>
      <button onClick={desistir} disabled={sending}
        className="inline-flex items-center min-h-10 px-4 rounded-full border border-mist text-[13px] font-semibold text-ink hover:bg-warm disabled:opacity-50 transition-colors">
        {sending ? 'Enviando…' : 'Desistir da compra'}
      </button>
      {error && <p role="alert" className="text-[12px] text-red-600 mt-2">{error}</p>}
    </section>
  );
}
