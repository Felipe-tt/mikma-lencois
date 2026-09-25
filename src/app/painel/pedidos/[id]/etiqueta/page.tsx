'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import type { Order, User } from '@/types';
import type { StoreSettings } from '@/lib/store-settings';
import { STORE_DEFAULTS } from '@/lib/store-settings';
import { formatCurrency } from '@/lib/utils/format';
import { carrierNameVendor, isCorreios } from '@/lib/carriers';
import { IconArrowRight, IconPrint } from '@/components/ui/Icon';

const STORE_NAME = 'Mikma Lençóis';
const STORE_ADDRESS = process.env.NEXT_PUBLIC_STORE_ADDRESS || '';

function fmtDate(value: string | { toDate?: () => Date; seconds?: number } | null | undefined) {
  let d: Date;
  if (value && typeof value === 'object' && typeof value.toDate === 'function') {
    d = value.toDate();
  } else if (value && typeof value === 'object' && typeof value.seconds === 'number') {
    d = new Date(value.seconds * 1000);
  } else if (typeof value === 'string') {
    d = new Date(value);
  } else {
    return '-';
  }
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function EtiquetaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<Order | null>(null);
  const [customer, setCustomer] = useState<User | null>(null);
  const [settings, setSettings] = useState<StoreSettings>(STORE_DEFAULTS);
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
        const sSnap = await getDoc(doc(db, 'settings', 'store'));
        if (sSnap.exists()) setSettings({ ...STORE_DEFAULTS, ...sSnap.data() } as StoreSettings);
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
              {order.address.complement ? `, ${order.address.complement}` : ''}
            </p>
            <p className="text-[13px]">{order.address.neighborhood}</p>
            <p className="text-[13px]">{order.address.city}, {order.address.state}</p>
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
          O que embalar, {totalItems} {totalItems === 1 ? 'peça' : 'peças'}
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
          Este documento é uma nota de separação/expedição de uso interno, não é um documento fiscal.
        </p>
      </div>

      {order.delivery.carrier && isCorreios(order.delivery.carrier) && (
        <>
          {/* ── Etiqueta de remetente/destinatário, pra recortar e colar no pacote ── */}
          <div className="border border-mist bg-white text-black p-8 mt-8 print:border-0 print:p-0 print:break-before-page">
            <p data-no-print className="text-[11px] font-semibold text-mid mb-3">
              Etiqueta — recorte a caixa abaixo e cole na embalagem
            </p>
            <div className="border-2 border-dashed border-neutral-400 p-6">
              <div className="mb-6">
                <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide mb-1">Remetente</p>
                <p className="text-[14px] font-bold">{settings.storeName || STORE_NAME}</p>
                <p className="text-[13px]">{settings.storeAddress || STORE_ADDRESS || 'Endereço da loja não cadastrado em Configurações'}</p>
                {settings.storeCep && <p className="text-[13px]">CEP {settings.storeCep}</p>}
                {settings.storeCnpj && <p className="text-[12px] text-neutral-600 mt-0.5">CNPJ {settings.storeCnpj}</p>}
              </div>
              <div className="border-t-2 border-black pt-4">
                <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide mb-1">Destinatário</p>
                <p className="text-[20px] font-bold">{customer?.name || 'Cliente'}</p>
                <p className="text-[16px] mt-1">
                  {order.address.street}, {order.address.number}
                  {order.address.complement ? `, ${order.address.complement}` : ''}
                </p>
                <p className="text-[16px]">{order.address.neighborhood}</p>
                <p className="text-[16px]">{order.address.city} - {order.address.state}</p>
                <p className="text-[18px] font-bold mt-1">CEP {order.address.cep}</p>
              </div>
            </div>
          </div>

          {/* ── Declaração de Conteúdo, exigida pelos Correios pra postar mercadoria ── */}
          <div className="border border-mist bg-white text-black p-8 mt-8 print:border-0 print:p-0 print:break-before-page">
            <p className="font-display text-lg border-b-2 border-black pb-2 mb-4">Declaração de Conteúdo</p>

            <div className="grid grid-cols-2 gap-6 mb-4">
              <div>
                <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide mb-1">Remetente</p>
                <p className="text-[13px] font-semibold">{settings.storeName || STORE_NAME}</p>
                <p className="text-[12px]">{settings.storeAddress || STORE_ADDRESS}</p>
                {settings.storeCnpj && <p className="text-[12px]">CNPJ {settings.storeCnpj}</p>}
              </div>
              <div>
                <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide mb-1">Destinatário</p>
                <p className="text-[13px] font-semibold">{customer?.name || 'Cliente'}</p>
                <p className="text-[12px]">{order.address.street}, {order.address.number} - {order.address.neighborhood}</p>
                <p className="text-[12px]">{order.address.city}/{order.address.state} - CEP {order.address.cep}</p>
                {customer?.cpf && <p className="text-[12px]">CPF {customer.cpf}</p>}
              </div>
            </div>

            <table className="w-full text-[13px] border border-neutral-400">
              <thead>
                <tr className="text-left text-[10px] text-neutral-600 uppercase tracking-wide bg-neutral-100">
                  <th className="py-1.5 px-2 border-r border-neutral-400 font-semibold">Qtd.</th>
                  <th className="py-1.5 px-2 border-r border-neutral-400 font-semibold">Espécie (descrição do conteúdo)</th>
                  <th className="py-1.5 px-2 border-r border-neutral-400 font-semibold text-right">Valor unitário</th>
                  <th className="py-1.5 px-2 font-semibold text-right">Valor total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((it, i) => (
                  <tr key={i} className="border-t border-neutral-400">
                    <td className="py-2 px-2 border-r border-neutral-400">{it.quantity}</td>
                    <td className="py-2 px-2 border-r border-neutral-400">
                      {it.productName} — {it.variant.size} · {it.variant.fabric}{it.variant.colorName ? ` · ${it.variant.colorName}` : ''}
                    </td>
                    <td className="py-2 px-2 border-r border-neutral-400 text-right">{formatCurrency(it.unitPrice)}</td>
                    <td className="py-2 px-2 text-right">{formatCurrency(it.unitPrice * it.quantity)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-black">
                  <td colSpan={3} className="py-2 px-2 text-right font-bold">Valor total declarado</td>
                  <td className="py-2 px-2 text-right font-bold">{formatCurrency(order.totalCents - (order.delivery.priceCents ?? 0))}</td>
                </tr>
              </tfoot>
            </table>

            <p className="text-[10px] text-neutral-500 mt-4 leading-relaxed">
              Declaro que o conteúdo descrito acima corresponde à mercadoria contida nesta encomenda,
              conforme exigido pelos Correios para o envio de mercadorias.
            </p>

            <div className="grid grid-cols-2 gap-6 mt-10">
              <div className="border-t border-black pt-1 text-[11px] text-neutral-500">Assinatura do remetente</div>
              <div className="text-[11px] text-neutral-500">Data: {fmtDate(new Date().toISOString())}</div>
            </div>

            <p data-no-print className="text-[11px] text-mid mt-6 border-t border-mist pt-4">
              A agência costuma ter o formulário próprio em duas vias — se ela pedir, é só preencher
              lá com as mesmas informações desta folha. Esta impressão serve pra você não ter que
              descobrir os dados na hora, na fila.
            </p>
          </div>

          {/* ── Checklist antes de ir na agência ── */}
          <div data-no-print className="bg-clay-l/10 border border-clay-l/30 rounded-xl p-5 mt-6">
            <p className="text-[12px] font-bold text-ink mb-2">Antes de ir na agência dos Correios</p>
            <ul className="text-[12px] text-mid space-y-1 list-disc list-inside">
              <li>Pacote já embalado e pesado, se tiver balança em casa (ajuda a não ser surpreendido no valor).</li>
              <li>Leve esta folha impressa (etiqueta + declaração de conteúdo).</li>
              <li>Leve um documento de identidade seu.</li>
              <li>Depois de postar, anota o código de rastreio que a atendente te dá e cola no botão &quot;Confirmar despacho&quot; do pedido.</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
