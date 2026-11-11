'use client';

import { useEffect, useState } from 'react';
import { confirmDialog } from '@/components/ui/ConfirmDialog';

export interface PrePostagemView {
  id: string;
  codigoObjeto: string;
  coleta: boolean;
  createdAt: string;
}

/**
 * Etiqueta e coleta dos Correios pelo contrato, direto do pedido: gera o
 * código de rastreio, pede para os Correios buscarem na loja e imprime a
 * etiqueta. Sem Portal Postal.
 */
export function CorreiosLabelCard({ orderId, user, prePostagem, onCode }: {
  orderId: string;
  user: { getIdToken: () => Promise<string> };
  prePostagem?: PrePostagemView;
  /** Código de rastreio da etiqueta, para já preencher o despacho. */
  onCode: (code: string) => void;
}) {
  const [busy, setBusy] = useState<'' | 'gerar' | 'imprimir' | 'cancelar'>('');
  const [error, setError] = useState('');

  useEffect(() => { if (prePostagem?.codigoObjeto) onCode(prePostagem.codigoObjeto); }, [prePostagem?.codigoObjeto, onCode]);

  const url = `/api/painel/pedidos/${orderId}/etiqueta`;
  const auth = async () => ({ Authorization: `Bearer ${await user.getIdToken()}` });

  async function generate(coleta: boolean) {
    setBusy('gerar'); setError('');
    try {
      const res = await fetch(url, { method: 'POST', headers: { ...(await auth()), 'Content-Type': 'application/json' }, body: JSON.stringify({ coleta }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? 'Não foi possível gerar a etiqueta. Tente de novo.');
    } catch {
      setError('Sem conexão. Tente de novo.');
    } finally { setBusy(''); }
  }

  async function print() {
    // Abre a aba já no clique (senão o navegador bloqueia) e põe o PDF nela.
    const tab = window.open('', '_blank');
    setBusy('imprimir'); setError('');
    try {
      const res = await fetch(url, { headers: await auth() });
      if (!res.ok) {
        tab?.close();
        setError((await res.json().catch(() => ({}))).error ?? 'Não foi possível baixar a etiqueta.');
        return;
      }
      const blob = URL.createObjectURL(await res.blob());
      if (tab) tab.location.replace(blob);
      else window.location.assign(blob);
    } catch {
      tab?.close();
      setError('Sem conexão. Tente de novo.');
    } finally { setBusy(''); }
  }

  async function cancel() {
    const { confirmed } = await confirmDialog({
      message: 'Cancelar esta etiqueta?',
      detail: prePostagem?.coleta
        ? 'O código de rastreio deixa de valer. Se a coleta já foi agendada, avise os Correios caso eles ainda passem na loja.'
        : 'O código de rastreio deixa de valer e você pode gerar outra.',
      confirmLabel: 'Cancelar etiqueta',
      variant: 'danger',
    });
    if (!confirmed) return;
    setBusy('cancelar'); setError('');
    try {
      const res = await fetch(url, { method: 'DELETE', headers: await auth() });
      if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? 'Não foi possível cancelar.');
      else onCode('');
    } catch {
      setError('Sem conexão. Tente de novo.');
    } finally { setBusy(''); }
  }

  if (!prePostagem) {
    return (
      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => generate(true)} disabled={!!busy}
          className="w-full bg-ink text-paper text-[13px] font-bold py-3 hover:bg-ink/80 disabled:opacity-50 transition-colors rounded-xl">
          {busy === 'gerar' ? 'Falando com os Correios…' : 'Gerar etiqueta e pedir coleta'}
        </button>
        <button type="button" onClick={() => generate(false)} disabled={!!busy}
          className="self-center text-[12px] text-mid underline underline-offset-2 hover:text-ink disabled:opacity-50 py-1">
          Só gerar a etiqueta (eu levo à agência)
        </button>
        {error && <p role="alert" className="text-[12px] text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-mist bg-white dark:bg-warm px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-faint">Etiqueta dos Correios</p>
          <p className="font-mono text-[14px] font-bold text-ink tracking-wide">{prePostagem.codigoObjeto}</p>
          <p className="text-[11px] text-mid mt-0.5">
            {prePostagem.coleta ? 'Coleta pedida: os Correios passam na loja para buscar.' : 'Sem coleta: leve o pacote a uma agência.'}
          </p>
        </div>
        <button type="button" onClick={cancel} disabled={!!busy}
          className="shrink-0 text-[11.5px] text-mid underline underline-offset-2 hover:text-red-600 disabled:opacity-50">
          {busy === 'cancelar' ? 'Cancelando…' : 'Cancelar'}
        </button>
      </div>
      <button type="button" onClick={print} disabled={!!busy}
        className="w-full border border-ink text-ink text-[13px] font-bold py-2.5 hover:bg-warm disabled:opacity-50 transition-colors rounded-xl">
        {busy === 'imprimir' ? 'Baixando a etiqueta…' : 'Imprimir etiqueta'}
      </button>
      {error && <p role="alert" className="text-[12px] text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{error}</p>}
    </div>
  );
}
