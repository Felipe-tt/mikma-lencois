'use client';

import { useState } from 'react';
import { auth } from '@/lib/firebase/client';
import { confirmDialog } from '@/components/ui/ConfirmDialog';

export interface ReversaView {
  codigoObjeto: string;
  validade: string;
  entregueEm?: string;
}

const dia = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

/**
 * Código de devolução dos Correios numa troca aprovada: o cliente leva o
 * pacote a qualquer agência com o código, sem pagar. Os Correios mandam o
 * código por e-mail; aqui dá para copiar e mandar pelo WhatsApp também.
 */
export function ReversaCard({ returnId, reversa }: { returnId: string; reversa?: ReversaView }) {
  const [busy, setBusy] = useState<'' | 'gerar' | 'cancelar'>('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const url = `/api/painel/trocas/${returnId}/reversa`;

  async function call(method: 'POST' | 'DELETE') {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Sua sessão expirou. Entre de novo.');
    const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? 'Não foi possível falar com os Correios.');
  }

  async function generate() {
    setBusy('gerar'); setError('');
    try { await call('POST'); } catch (err) { setError(err instanceof Error ? err.message : 'Sem conexão.'); } finally { setBusy(''); }
  }

  async function cancel() {
    const { confirmed } = await confirmDialog({
      message: 'Cancelar o código de devolução?',
      detail: 'O cliente não vai mais conseguir postar com ele. Você pode gerar outro depois.',
      confirmLabel: 'Cancelar código',
      variant: 'danger',
    });
    if (!confirmed) return;
    setBusy('cancelar'); setError('');
    try { await call('DELETE'); } catch (err) { setError(err instanceof Error ? err.message : 'Sem conexão.'); } finally { setBusy(''); }
  }

  async function copy() {
    if (!reversa) return;
    const texto = `Seu código de devolução dos Correios é ${reversa.codigoObjeto}. Leve o pacote a qualquer agência até ${dia(reversa.validade)} e informe esse código: o envio é por nossa conta.`;
    try { await navigator.clipboard.writeText(texto); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* sem permissão */ }
  }

  if (!reversa) {
    return (
      <div className="mt-3 flex flex-col gap-2">
        <button type="button" onClick={generate} disabled={!!busy}
          className="self-start border border-ink text-ink text-[11px] font-bold uppercase tracking-wide px-3.5 py-2 hover:bg-ink hover:text-paper transition-colors disabled:opacity-50 rounded-full">
          {busy === 'gerar' ? 'Falando com os Correios…' : 'Gerar código de devolução (Correios)'}
        </button>
        <p className="text-[11px] text-faint">O cliente posta de graça em qualquer agência; o frete sai do contrato da loja.</p>
        {error && <p role="alert" className="text-[12px] text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-mist bg-warm/40 px-4 py-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-faint">Código de devolução dos Correios</p>
          <p className="font-mono text-[15px] font-bold text-ink tracking-wide">{reversa.codigoObjeto}</p>
          <p className="text-[11.5px] text-mid">
            {reversa.entregueEm
              ? `O pacote chegou na loja em ${dia(reversa.entregueEm)}.`
              : `O cliente posta em qualquer agência até ${dia(reversa.validade)}. Os Correios mandaram o código por e-mail para ele.`}
          </p>
        </div>
        {!reversa.entregueEm && (
          <button type="button" onClick={cancel} disabled={!!busy}
            className="shrink-0 text-[11.5px] text-mid underline underline-offset-2 hover:text-red-600 disabled:opacity-50">
            {busy === 'cancelar' ? 'Cancelando…' : 'Cancelar'}
          </button>
        )}
      </div>
      {!reversa.entregueEm && (
        <button type="button" onClick={copy}
          className="self-start text-[12px] font-semibold text-clay hover:text-clay-d">
          {copied ? 'Mensagem copiada, é só colar no WhatsApp' : 'Copiar mensagem para o cliente'}
        </button>
      )}
      {error && <p role="alert" className="text-[12px] text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{error}</p>}
    </div>
  );
}
