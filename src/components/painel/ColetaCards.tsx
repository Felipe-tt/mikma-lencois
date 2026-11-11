'use client';

import { useState } from 'react';
import { auth } from '@/lib/firebase/client';
import { confirmDialog } from '@/components/ui/ConfirmDialog';

export interface ColetaUberView {
  deliveryId: string;
  trackingUrl?: string;
  status?: string;
  feeCents?: number;
  coletadoEm?: string;
  entregueEm?: string;
}

const hora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const STATUS: Record<string, string> = {
  pending: 'Procurando entregador',
  pickup: 'Entregador indo buscar na casa do cliente',
  pickup_complete: 'Entregador com o pacote, vindo para a loja',
  dropoff: 'Entregador com o pacote, vindo para a loja',
  delivered: 'Pacote entregue na loja',
};

const erroBox = 'text-[12px] text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl';
const botao = 'self-start border border-ink text-ink text-[11px] font-bold uppercase tracking-wide px-3.5 py-2 hover:bg-ink hover:text-paper transition-colors disabled:opacity-50 rounded-full';

/**
 * Troca de pedido que chegou pela Uber: a loja chama um entregador para
 * buscar as peças na casa do cliente e trazer para a loja.
 */
export function ColetaUberCard({ returnId, coleta, saving = false }: { returnId: string; coleta?: ColetaUberView; saving?: boolean }) {
  const [busy, setBusy] = useState<'' | 'chamar' | 'cancelar'>('');
  const [error, setError] = useState('');
  const url = `/api/painel/trocas/${returnId}/coleta-uber`;

  async function call(method: 'POST' | 'DELETE') {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Sua sessão expirou. Entre de novo.');
    const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? 'Não foi possível falar com a Uber.');
  }

  async function chamar() {
    const { confirmed } = await confirmDialog({
      message: 'Chamar o entregador agora?',
      detail: 'Ele sai para a casa do cliente em poucos minutos. Confirme antes que o cliente está em casa com o pacote pronto.',
      confirmLabel: 'Chamar entregador',
    });
    if (!confirmed) return;
    setBusy('chamar'); setError('');
    try { await call('POST'); } catch (err) { setError(err instanceof Error ? err.message : 'Sem conexão.'); } finally { setBusy(''); }
  }

  async function cancelar() {
    const { confirmed } = await confirmDialog({
      message: 'Cancelar a coleta?',
      detail: 'O entregador deixa de ir até o cliente. Você pode chamar outro depois.',
      confirmLabel: 'Cancelar coleta',
      variant: 'danger',
    });
    if (!confirmed) return;
    setBusy('cancelar'); setError('');
    try { await call('DELETE'); } catch (err) { setError(err instanceof Error ? err.message : 'Sem conexão.'); } finally { setBusy(''); }
  }

  if (!coleta) {
    return (
      <div className="mt-3 flex flex-col gap-2">
        <button type="button" onClick={chamar} disabled={!!busy || saving} className={botao}>
          {busy === 'chamar' ? 'Chamando a Uber…' : 'Chamar entregador da Uber'}
        </button>
        <p className="text-[11px] text-faint">Combine o horário com o cliente antes: o entregador sai na hora e leva o pacote até a loja. A corrida é por conta da loja.</p>
        {error && <p role="alert" className={erroBox}>{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-mist bg-warm/40 px-4 py-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-faint">Coleta pela Uber</p>
          <p className="text-[14px] font-semibold text-ink">{coleta.entregueEm ? STATUS.delivered : STATUS[coleta.status ?? 'pending'] ?? 'Em andamento'}</p>
          <p className="text-[11.5px] text-mid">
            {coleta.entregueEm ? `Chegou em ${hora(coleta.entregueEm)}. Confira as peças e conclua.`
              : coleta.coletadoEm ? `Pegou o pacote em ${hora(coleta.coletadoEm)}.`
              : 'O cliente recebeu um e-mail avisando que o entregador está indo.'}
            {typeof coleta.feeCents === 'number' && coleta.feeCents > 0 && ` Corrida: R$ ${(coleta.feeCents / 100).toFixed(2).replace('.', ',')}.`}
          </p>
        </div>
        {!coleta.coletadoEm && !coleta.entregueEm && (
          <button type="button" onClick={cancelar} disabled={!!busy}
            className="shrink-0 text-[11.5px] text-mid underline underline-offset-2 hover:text-red-600 disabled:opacity-50">
            {busy === 'cancelar' ? 'Cancelando…' : 'Cancelar'}
          </button>
        )}
      </div>
      {coleta.trackingUrl && !coleta.entregueEm && (
        <a href={coleta.trackingUrl} target="_blank" rel="noopener noreferrer" className="self-start text-[12px] font-semibold text-clay hover:text-clay-d">
          Acompanhar o entregador
        </a>
      )}
      {error && <p role="alert" className={erroBox}>{error}</p>}
    </div>
  );
}

/** Troca entregue no balcão: a equipe marca quando recebe as peças. */
export function LojaCard({ recebidaEm, onReceber, busy = false }: { recebidaEm?: string; onReceber: () => void; busy?: boolean }) {
  if (recebidaEm) {
    return (
      <div className="mt-3 rounded-xl border border-mist bg-warm/40 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-faint">Entrega na loja</p>
        <p className="text-[13px] text-ink">Peças recebidas em {hora(recebidaEm)}. Confira e conclua.</p>
      </div>
    );
  }
  return (
    <div className="mt-3 flex flex-col gap-2">
      <button type="button" onClick={onReceber} disabled={busy} className={botao}>
        Recebi as peças na loja
      </button>
      <p className="text-[11px] text-faint">O cliente vai trazer as peças no balcão. Quando chegarem, toque aqui: ele recebe um e-mail.</p>
    </div>
  );
}
