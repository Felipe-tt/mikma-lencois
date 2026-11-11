'use client';

import { useState } from 'react';
import { auth } from '@/lib/firebase/client';
import { IconTruck } from '@/components/ui/Icon';
import type { Order } from '@/types';

type WithLabel = Order & { delivery: Order['delivery'] & { prePostagem?: { codigoObjeto: string } } };

const CORREIOS = new Set(['correios_pac', 'correios_sedex']);

/**
 * Etiquetas do dia em lote, na lista de pedidos: os pedidos dos Correios em
 * separação geram etiqueta (e coleta) de uma vez e saem num PDF só.
 */
export function CorreiosBatchBar({ orders }: { orders: Order[] }) {
  const separando = (orders as WithLabel[]).filter(o => o.status === 'preparing' && CORREIOS.has(o.delivery?.carrier ?? ''));
  const semEtiqueta = separando.filter(o => !o.delivery?.prePostagem);
  const comEtiqueta = separando.filter(o => o.delivery?.prePostagem);
  const [busy, setBusy] = useState<'' | 'gerar' | 'imprimir'>('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'erro'; text: string } | null>(null);

  if (!separando.length) return null;

  async function token() {
    const t = await auth.currentUser?.getIdToken();
    if (!t) throw new Error('Sua sessão expirou. Entre de novo.');
    return t;
  }

  async function generate() {
    setBusy('gerar'); setMessage(null);
    try {
      const res = await fetch('/api/painel/etiquetas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ orderIds: semEtiqueta.map(o => o.id), coleta: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage({ tone: 'erro', text: data.error ?? 'Não foi possível gerar as etiquetas.' }); return; }
      const results = (data.results ?? []) as Array<{ orderId: string; codigoObjeto?: string; error?: string }>;
      const falhas = results.filter(r => r.error);
      const ok = results.length - falhas.length;
      setMessage(falhas.length
        ? { tone: 'erro', text: `${ok} etiqueta${ok === 1 ? '' : 's'} gerada${ok === 1 ? '' : 's'}. Não deu em ${falhas.length}: ${falhas.map(f => `#${f.orderId.slice(-8).toUpperCase()} (${f.error})`).join('; ')}` }
        : { tone: 'ok', text: `${ok} etiqueta${ok === 1 ? '' : 's'} gerada${ok === 1 ? '' : 's'} e coleta pedida aos Correios.` });
    } catch (err) {
      setMessage({ tone: 'erro', text: err instanceof Error && err.message.includes('sessão') ? err.message : 'Sem conexão. Tente de novo.' });
    } finally { setBusy(''); }
  }

  async function print() {
    // Abre a aba já no clique (senão o navegador bloqueia) e põe o PDF nela.
    const tab = window.open('', '_blank');
    setBusy('imprimir'); setMessage(null);
    try {
      const res = await fetch(`/api/painel/etiquetas?pedidos=${comEtiqueta.map(o => o.id).join(',')}`, { headers: { Authorization: `Bearer ${await token()}` } });
      if (!res.ok) {
        tab?.close();
        setMessage({ tone: 'erro', text: (await res.json().catch(() => ({}))).error ?? 'Não foi possível baixar as etiquetas.' });
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      if (tab) tab.location.replace(url);
      else window.location.assign(url);
    } catch {
      tab?.close();
      setMessage({ tone: 'erro', text: 'Sem conexão. Tente de novo.' });
    } finally { setBusy(''); }
  }

  const n = (k: number, um: string, varios: string) => `${k} ${k === 1 ? um : varios}`;

  return (
    <section aria-label="Etiquetas dos Correios" className="mb-5 rounded-xl border border-mist bg-paper px-4 py-3.5 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 shrink-0 rounded-full bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300 flex items-center justify-center">
          <IconTruck size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink">Envios pelos Correios</p>
          <p className="text-[12px] text-mid">
            {n(separando.length, 'pedido separando', 'pedidos separando')}
            {semEtiqueta.length ? ` · ${n(semEtiqueta.length, 'sem etiqueta', 'sem etiqueta')}` : ' · todos com etiqueta'}
          </p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        {semEtiqueta.length > 0 && (
          <button type="button" onClick={generate} disabled={!!busy}
            className="flex-1 bg-ink text-paper text-[13px] font-bold py-2.5 px-4 hover:bg-ink/80 disabled:opacity-50 transition-colors rounded-xl">
            {busy === 'gerar' ? 'Falando com os Correios…' : `Gerar ${n(semEtiqueta.length, 'etiqueta', 'etiquetas')} e pedir coleta`}
          </button>
        )}
        {comEtiqueta.length > 0 && (
          <button type="button" onClick={print} disabled={!!busy}
            className="flex-1 border border-ink text-ink text-[13px] font-bold py-2.5 px-4 hover:bg-warm disabled:opacity-50 transition-colors rounded-xl">
            {busy === 'imprimir' ? 'Baixando…' : `Imprimir ${n(comEtiqueta.length, 'etiqueta', 'etiquetas')}`}
          </button>
        )}
      </div>
      {message && (
        <p role="status" className={`text-[12px] px-3 py-2 rounded-xl border ${message.tone === 'ok' ? 'text-emerald-800 bg-emerald-50 border-emerald-200' : 'text-red-700 bg-red-50 border-red-200'}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
