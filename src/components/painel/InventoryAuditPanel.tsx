'use client';

import { useState } from 'react';
import { auth } from '@/lib/firebase/client';
import { IconAlert, IconCheck, IconListCheck } from '@/components/ui/Icon';
import { confirmDialog } from '@/components/ui/ConfirmDialog';

interface SkuMismatch {
  sku: string;
  productId: string;
  currentReserved: number;
  expectedReserved: number;
  diff: number;
}

interface AuditResult {
  summary: {
    pendingOrdersChecked: number;
    inventoryItemsChecked: number;
    skuMismatchCount: number;
    suspiciousCancellationCount: number;
  };
  skuMismatches: SkuMismatch[];
  suspiciousCancellations: Array<{ orderId: string; totalCents?: number }>;
}

/**
 * "Reserva" é a quantidade que já está separada para pedidos aguardando
 * pagamento — não é estoque físico. Esse número é mantido por incrementos
 * e decrementos espalhados por vários pontos (checkout, webhook de
 * pagamento, cancelamento, expiração), então pode desandar: uma reserva
 * que não foi liberada trava peça que já podia estar à venda.
 *
 * Este painel recalcula o valor certo a partir dos pedidos em aberto e
 * mostra a diferença. Corrigir só mexe em `reserved`, nunca no estoque
 * físico (`quantity`), que só uma contagem na prateleira confirma.
 */
export function InventoryAuditPanel() {
  const [result, setResult] = useState<AuditResult | null>(null);
  const [running, setRunning] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fixed, setFixed] = useState<{ corrected: number; skipped: number } | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setFixed(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/painel/inventory-audit', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível rodar a verificação.');
        return;
      }
      setResult(data);
    } catch {
      setError('Erro de conexão. Verifique sua internet e tente de novo.');
    } finally {
      setRunning(false);
    }
  }

  async function fix() {
    if (!result) return;
    const { confirmed } = await confirmDialog({
      message: `Corrigir ${result.summary.skuMismatchCount} reserva(s)?`,
      detail: 'Isso ajusta só a quantidade reservada para pedidos em aberto, recalculada a partir dos pedidos que existem agora. O estoque físico não é alterado, e cada ajuste fica registrado no histórico do item.',
      confirmLabel: 'Corrigir reservas',
    });
    if (!confirmed) return;

    setFixing(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/painel/inventory-audit', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível corrigir.');
        return;
      }
      setFixed({ corrected: data.corrected, skipped: data.skipped });
      await run();
    } catch {
      setError('Erro de conexão. Verifique sua internet e tente de novo.');
    } finally {
      setFixing(false);
    }
  }

  const mismatchCount = result?.summary.skuMismatchCount ?? 0;

  return (
    <div className="border border-mist bg-paper rounded-xl p-4 mb-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex-1">
          <p className="text-[13px] font-semibold text-ink">Verificar reservas travadas</p>
          <p className="text-[12px] text-faint mt-0.5 leading-relaxed">
            Peças separadas para pedidos que nunca foram pagos podem ficar presas e sumir da venda.
            Aqui você confere e libera.
          </p>
        </div>
        <button
          onClick={run}
          disabled={running || fixing}
          className="shrink-0 flex items-center justify-center gap-1.5 border border-mist bg-white dark:bg-warm text-[12.5px] font-semibold text-mid px-4 py-2.5 hover:bg-warm hover:text-ink disabled:opacity-50 transition-colors rounded-lg"
        >
          <IconListCheck size={13} />
          {running ? 'Verificando…' : 'Verificar agora'}
        </button>
      </div>

      {error && (
        <p className="text-[12px] text-red-600 mt-3 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</p>
      )}

      {fixed && (
        <p className="text-[12px] text-emerald-700 mt-3 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg">
          {fixed.corrected} reserva(s) corrigida(s).
          {fixed.skipped > 0 && ` ${fixed.skipped} pulada(s) porque mudaram durante a correção, rode de novo para conferir.`}
        </p>
      )}

      {result && (
        <div className="mt-4 pt-4 border-t border-mist">
          {mismatchCount === 0 ? (
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <IconCheck size={12} />
              </span>
              <p className="text-[13px] text-mid">
                Tudo certo. Nenhuma reserva travada
                <span className="text-faint"> · {result.summary.pendingOrdersChecked} pedido(s) em aberto conferido(s)</span>
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-6 h-6 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                  <IconAlert size={12} />
                </span>
                <p className="text-[13px] font-semibold text-ink">
                  {mismatchCount} item(ns) com reserva diferente do esperado
                </p>
              </div>

              <div className="flex flex-col gap-1.5 mb-3">
                {result.skuMismatches.slice(0, 8).map(m => (
                  <div key={m.sku} className="flex items-center justify-between gap-3 text-[12px] bg-warm px-3 py-2 rounded-lg">
                    <span className="font-mono text-faint truncate">{m.sku}</span>
                    <span className="shrink-0 tabular-nums text-mid">
                      {m.currentReserved} → <strong className="text-ink">{m.expectedReserved}</strong>
                      <span className={m.diff > 0 ? 'text-amber-700 ml-1.5' : 'text-blue-700 ml-1.5'}>
                        ({m.diff > 0 ? `libera ${m.diff}` : `reserva ${Math.abs(m.diff)}`})
                      </span>
                    </span>
                  </div>
                ))}
                {result.skuMismatches.length > 8 && (
                  <p className="text-[11px] text-faint px-1">e mais {result.skuMismatches.length - 8}…</p>
                )}
              </div>

              <button
                onClick={fix}
                disabled={fixing || running}
                className="w-full sm:w-auto bg-ink text-paper text-[12.5px] font-bold px-5 py-2.5 hover:bg-ink/80 disabled:opacity-50 transition-colors rounded-lg"
              >
                {fixing ? 'Corrigindo…' : 'Corrigir reservas'}
              </button>
            </>
          )}

          {result.summary.suspiciousCancellationCount > 0 && (
            <div className="mt-4 pt-3 border-t border-mist">
              <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg leading-relaxed">
                <strong>{result.summary.suspiciousCancellationCount} pedido(s) cancelado(s) que constam como pagos.</strong>{' '}
                Isso não é corrigido automaticamente porque envolve dinheiro recebido, confira um a um no painel de pedidos.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
