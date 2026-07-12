'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import type { Order, User } from '@/types';
import { formatCurrency } from '@/lib/utils/format';
import { carrierNameVendor } from '@/lib/carriers';
import { IconArrowRight, IconPrint } from '@/components/ui/Icon';

const STORE_NAME = 'Mikma Lençóis';
const STORE_ADDRESS = process.env.NEXT_PUBLIC_STORE_ADDRESS || '';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function EtiquetaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<Order | null>(null);
  const [customer, setCustomer] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'orders', id));
        if (!snap.exists()) { setNotFound(true); return; }
        const o = { id: snap.id, ...snap.data() } as Order;
        setOrder(o);
        const uSnap = await getDoc(doc(db, 'users', o.userId));
        if (uSnap.exists()) setCustomer(uSnap.data() as User);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <p className="text-[13px] text-faint">Carregando etiqueta…</p>;
  if (notFound || !order) {
    return (
      <div>
        <p className="text-[13px] text-red-600">Pedido não encontrado.</p>
        <Link href="/painel/pedidos" className="text-[12px] text-clay-l font-semibold mt-2 inline-block">Voltar pros pedidos</Link>
      </div>
    );
  }

  const totalItems = order.items.reduce((s, it) => s + it.quantity, 0);

  return (
    <div className="max-w-2xl">
      <div data-no-print className="flex items-center justify-between mb-6">
        <Link href={`/painel/pedidos/${order.id}`} className="flex items-center gap-1.5 text-[12px] font-semibold text-mid hover:text-ink transition-colors">
          <IconArrowRight size={13} className="rotate-180" /> Voltar pro pedido
        </Link>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 bg-ink text-paper text-[11px] font-bold tracking-[0.08em] uppercase px-5 py-2.5 hover:bg-ink/80 transition-colors"
        >
          <IconPrint size={13} /> Imprimir
        </button>
      </div>

      {/* ── Conteúdo impresso ── */}
      <div className="border border-mist bg-white text-black p-8 print:border-0 print:p-0">
        <div className="flex items-start justify-between border-b-2 border-black pb-4 mb-4">
          <div>
            <p className="font-display text-xl">{STORE_NAME}</p>
            {STORE_ADDRESS && <p className="text-[11px] text-neutral-600 mt-0.5 max-w-[280px]">{STORE_ADDRESS}</p>}
          </div>
          <div className="text-right">
            <p className="text-[11px] text-neutral-500 uppercase tracking-wide">Pedido</p>
            <p className="text-lg font-bold leading-tight">#{order.id.slice(-8).toUpperCase()}</p>
            <p className="text-[11px] text-neutral-500 mt-1">{fmtDate(order.createdAt)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide mb-1.5">Destinatário</p>
            <p className="text-[14px] font-bold">{customer?.name || 'Cliente'}</p>
            <p className="text-[13px] mt-0.5">
              {order.address.street}, {order.address.number}
              {order.address.complement ? ` — ${order.address.complement}` : ''}
            </p>
            <p className="text-[13px]">{order.address.neighborhood}</p>
            <p className="text-[13px]">{order.address.city} — {order.address.state}</p>
            <p className="text-[13px] font-semibold mt-0.5">CEP {order.address.cep}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide mb-1.5">Envio</p>
            <p className="text-[13px]">{order.delivery.carrier ? carrierNameVendor(order.delivery.carrier) : 'A definir'}</p>
            {order.delivery.trackingCode && (
              <p className="text-[13px] mt-0.5">Rastreio: <strong>{order.delivery.trackingCode}</strong></p>
            )}
            {order.couponCode && (
              <p className="text-[13px] mt-0.5">Cupom: {order.couponCode}</p>
            )}
          </div>
        </div>

        <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide mb-2">
          O que embalar — {totalItems} {totalItems === 1 ? 'peça' : 'peças'}
        </p>
        <table className="w-full text-[13px] border-t border-b border-neutral-300">
          <thead>
            <tr className="text-left text-[10px] text-neutral-500 uppercase tracking-wide">
              <th className="py-1.5 font-semibold">Produto</th>
              <th className="py-1.5 font-semibold">Variação</th>
              <th className="py-1.5 font-semibold text-right">Qtd.</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it, i) => (
              <tr key={i} className="border-t border-neutral-200">
                <td className="py-2 pr-2">{it.productName}</td>
                <td className="py-2 pr-2 text-neutral-600">
                  {it.variant.size} · {it.variant.fabric}{it.variant.colorName ? ` · ${it.variant.colorName}` : ''}
                </td>
                <td className="py-2 text-right font-semibold">{it.quantity}×</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mt-3">
          <p className="text-[13px]">
            Total pago: <strong>{formatCurrency(order.totalCents)}</strong>
          </p>
        </div>

        <p className="text-[10px] text-neutral-400 mt-8 leading-relaxed">
          Este documento é uma nota de separação/expedição de uso interno — não é um documento fiscal.
        </p>
      </div>
    </div>
  );
}
