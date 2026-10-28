'use client';
import { useEffect, useState } from 'react';
import type { Order } from '@/types';
import type { OrderRisk, RiskAssessment } from '@/lib/fraudSignals';
import { confirmDialog } from '@/components/ui/ConfirmDialog';

/**
 * Detector de golpe no painel do pedido. Mostra a avaliação gravada no
 * pagamento (ou calculada na hora, para pedido antigo) e, se o envio estiver
 * segurado, o botão para liberar depois de conferir.
 */
export function RiskCard({ order, user }: { order: Order; user: { getIdToken: () => Promise<string> } | null }) {
  const stored = order.risk;
  const [live, setLive] = useState<RiskAssessment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (stored || !user) return;
    let cancelled = false;
    user.getIdToken()
      .then(token => fetch(`/api/painel/pedidos/${order.id}/fraud-signals`, { headers: { Authorization: `Bearer ${token}` } }))
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (!cancelled && data?.risk) setLive(data.risk); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [stored, order.id, user]);

  const risk: (RiskAssessment & Partial<OrderRisk>) | null = stored ?? live;
  if (!risk || (risk.level === 'baixo' && risk.signals.length === 0 && !risk.releasedBy)) return null;

  async function release() {
    const { confirmed } = await confirmDialog({
      message: 'Liberar o envio deste pedido?',
      detail: 'Confirme só depois de conferir os sinais (fale com o cliente se precisar). Fica registrado quem liberou.',
      confirmLabel: 'Conferi, liberar envio',
    });
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/painel/pedidos/${order.id}/fraud-signals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'release' }),
      });
      if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? 'Não foi possível liberar.');
    } catch {
      setError('Erro de conexão. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  const tone = risk.hold
    ? 'border-2 border-red-400 bg-red-50'
    : risk.level === 'alto' || risk.level === 'atencao' ? 'border border-amber-300 bg-amber-50' : 'border border-mist bg-warm';
  const title = risk.hold
    ? 'Pedido suspeito: envio segurado'
    : risk.releasedBy ? 'Pedido conferido' : risk.level === 'baixo' ? 'Sinais leves' : 'Revisar antes de despachar';

  return (
    <div role={risk.hold ? 'alert' : undefined} className={`${tone} px-5 py-4 rounded-xl`}>
      <div className="flex items-center justify-between gap-3 mb-1">
        <p className="text-[14px] font-bold text-ink">{title}</p>
        <span className="text-[11px] font-semibold text-mid">risco {risk.score}</span>
      </div>
      <ul className="text-[13px] text-ink/80 list-disc pl-5 space-y-0.5">
        {risk.signals.map((s, i) => <li key={i}>{s.reason}</li>)}
      </ul>
      {risk.releasedBy && (
        <p className="text-[11px] text-faint mt-1.5">Liberado por {risk.releasedBy}{risk.releasedAt ? ` em ${new Date(risk.releasedAt).toLocaleString('pt-BR')}` : ''}.</p>
      )}
      {risk.hold ? (
        <>
          <p className="text-[12px] text-ink/80 mt-2">O despacho e a nota automática esperam a sua conferência. Na dúvida, fale com o cliente antes.</p>
          <button disabled={busy} onClick={release}
            className="mt-2.5 min-h-10 px-4 rounded-full bg-ink text-paper text-[12px] font-semibold disabled:opacity-50">
            {busy ? 'Liberando…' : 'Conferi, liberar envio'}
          </button>
        </>
      ) : !risk.releasedBy && (
        <p className="text-[11px] text-faint mt-1">Não é confirmação de fraude, só um cruzamento de dados. Use seu julgamento.</p>
      )}
      {error && <p role="alert" className="text-[12px] text-red-700 mt-2">{error}</p>}
    </div>
  );
}
