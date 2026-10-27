'use client';
import { useState } from 'react';

import type { Order } from '@/types';
import type { NfeRecord } from '@/lib/nfe/types';
import type { NfeEnvironment } from '@/lib/nfe/config';
import { confirmDialog } from '@/components/ui/ConfirmDialog';

const STATUS_LABEL: Record<NfeRecord['status'], string> = {
  processando: 'Enviando à SEFAZ',
  autorizada: 'Autorizada',
  erro: 'Rejeitada',
  cancelada: 'Cancelada',
  pendente_dados: 'Faltam dados',
};
const STATUS_TONE: Record<NfeRecord['status'], string> = {
  processando: 'bg-amber-50 text-amber-700 border-amber-200',
  autorizada: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  erro: 'bg-red-50 text-red-700 border-red-200',
  cancelada: 'bg-warm text-mid border-mist',
  pendente_dados: 'bg-red-50 text-red-700 border-red-200',
};
const PAID = new Set(['paid', 'preparing', 'shipped', 'delivered']);

function NfeBlock({ env, rec, order, busy, onAction }: {
  env: NfeEnvironment;
  rec?: NfeRecord;
  order: Order;
  busy: boolean;
  onAction: (action: 'emit' | 'sync' | 'cancel', env: NfeEnvironment) => void;
}) {
  const test = env === 'homologacao';
  const canEmit = (test || PAID.has(order.status)) && (!rec || rec.status === 'erro' || rec.status === 'pendente_dados' || (rec.status === 'cancelada' && order.status !== 'cancelled'));
  const btn = 'min-h-10 px-3.5 text-[12px] font-semibold rounded-full border transition-colors disabled:opacity-50';
  return (
    <div className="py-3 border-b border-warm last:border-0">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-[12px] font-semibold text-ink">{test ? 'Nota de teste (homologação, sem valor fiscal)' : 'Nota fiscal'}</p>
        {rec && <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 border rounded ${STATUS_TONE[rec.status]}`}>{STATUS_LABEL[rec.status]}</span>}
      </div>
      {rec?.status === 'autorizada' && (
        <p className="text-[12px] text-mid mb-2">
          Nº {rec.numero} · série {rec.serie}
          {rec.chave && <span className="block font-mono text-[10px] text-faint break-all mt-0.5">{rec.chave}</span>}
        </p>
      )}
      {rec?.mensagem && <p className="text-[12px] text-red-700 mb-2 break-words">{rec.mensagem}</p>}
      {!rec && !test && !PAID.has(order.status) && <p className="text-[12px] text-faint mb-2">Sai depois do pagamento.</p>}
      <div className="flex flex-wrap gap-2">
        {canEmit && (
          <button disabled={busy} onClick={() => onAction('emit', env)} className={`${btn} ${test ? 'border-mist text-ink hover:bg-warm' : 'bg-ink text-paper border-ink hover:bg-ink/80'}`}>
            {busy ? 'Enviando…' : rec ? 'Emitir de novo' : test ? 'Emitir nota de teste' : 'Emitir nota fiscal'}
          </button>
        )}
        {rec?.status === 'processando' && (
          <button disabled={busy} onClick={() => onAction('sync', env)} className={`${btn} border-mist text-ink hover:bg-warm`}>Atualizar</button>
        )}
        {rec?.status === 'autorizada' && rec.danfeUrl && (
          <a href={rec.danfeUrl} target="_blank" rel="noopener noreferrer" className={`${btn} border-mist text-ink hover:bg-warm inline-flex items-center`}>DANFE (PDF)</a>
        )}
        {rec?.status === 'autorizada' && rec.xmlUrl && (
          <a href={rec.xmlUrl} target="_blank" rel="noopener noreferrer" className={`${btn} border-mist text-ink hover:bg-warm inline-flex items-center`}>XML</a>
        )}
        {rec?.status === 'autorizada' && (
          <button disabled={busy} onClick={() => onAction('cancel', env)} className={`${btn} border-red-200 text-red-700 hover:bg-red-50`}>Cancelar nota</button>
        )}
      </div>
    </div>
  );
}

/** Nota fiscal do pedido no painel: produção e teste (homologação). */
export function NfeCard({ order, user }: { order: Order; user: { getIdToken: () => Promise<string> } | null }) {
  const [busy, setBusy] = useState<NfeEnvironment | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onAction(action: 'emit' | 'sync' | 'cancel', environment: NfeEnvironment) {
    let justificativa: string | undefined;
    if (action === 'cancel') {
      const { confirmed, value } = await confirmDialog({
        message: 'Cancelar a nota fiscal?',
        detail: 'A SEFAZ só aceita até 24h depois da autorização. Escreva o motivo (mínimo 15 letras).',
        withInput: true,
        inputPlaceholder: 'Ex.: venda cancelada a pedido do cliente',
        confirmLabel: 'Cancelar nota',
        variant: 'danger',
      });
      if (!confirmed) return;
      justificativa = (value ?? '').trim();
      if (justificativa.length < 15) { setError('O motivo precisa ter pelo menos 15 letras.'); return; }
    } else if (action === 'emit' && environment === 'producao') {
      const { confirmed } = await confirmDialog({
        message: 'Emitir a nota fiscal deste pedido?',
        detail: 'A nota vai para a SEFAZ com valor fiscal, no CPF e endereço do cliente.',
        confirmLabel: 'Emitir',
      });
      if (!confirmed) return;
    }
    setBusy(environment);
    setError(null);
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/orders/${order.id}/nfe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, environment, justificativa }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? 'Não foi possível falar com o emissor.');
    } catch {
      setError('Erro de conexão. Tente de novo.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="bg-paper border border-mist rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-mist bg-warm">
        <p className="text-[12px] font-bold text-ink tracking-wide uppercase">Nota fiscal</p>
      </div>
      <div className="px-5 py-1">
        <NfeBlock env="producao" rec={order.nfe} order={order} busy={busy === 'producao'} onAction={onAction} />
        <NfeBlock env="homologacao" rec={order.nfeTeste} order={order} busy={busy === 'homologacao'} onAction={onAction} />
        {error && <p role="alert" className="text-[12px] text-red-700 py-2">{error}</p>}
      </div>
    </div>
  );
}
