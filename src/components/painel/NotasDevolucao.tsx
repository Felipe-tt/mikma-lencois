'use client';

import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/db';
import { auth } from '@/lib/firebase/client';

interface Nota { status: string; numero?: number; chave?: string; mensagem?: string | null; authorizedAt?: string }
interface Devolucao { id: string; type: 'troca' | 'devolucao'; status: string; createdAt: string }

const CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000;
const STATUS: Record<string, string> = {
  autorizada: 'Autorizada', processando: 'Na SEFAZ, conferindo', erro: 'Recusada', pendente_dados: 'Faltam dados', denegada: 'Denegada',
};

/**
 * Nota de devolução (entrada) para cada troca/devolução concluída e para o
 * pedido cancelado depois do prazo de cancelar a nota. Só aparece quando a
 * venda tem nota autorizada; mostra o estado de cada uma e o botão de emitir.
 */
export function NotasDevolucao({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [devolucoes, setDevolucoes] = useState<Devolucao[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [agora] = useState(() => Date.now());

  useEffect(() => onSnapshot(doc(db, 'orders', orderId), s => setOrder(s.data() ?? null), () => {}), [orderId]);
  useEffect(() => onSnapshot(
    query(collection(db, 'returns'), where('orderId', '==', orderId)),
    s => setDevolucoes(s.docs.map(d => ({ id: d.id, ...d.data() }) as Devolucao).filter(d => d.status === 'concluida')),
    () => {},
  ), [orderId]);

  if (!order) return null;
  // Ambiente das notas: produção se a venda tem nota de produção, senão teste.
  const prod = (order.nfe as Nota | undefined)?.status === 'autorizada';
  const venda = (prod ? order.nfe : order.nfeTeste) as Nota | undefined;
  if (venda?.status !== 'autorizada') return null;
  const env = prod ? 'producao' : 'homologacao';
  const notas = ((prod ? order.nfeDev : order.nfeDevTeste) ?? {}) as Record<string, Nota>;

  const linhas: { key: string; titulo: string }[] = devolucoes.map(d => ({ key: d.id, titulo: d.type === 'troca' ? 'Troca (peças que voltaram)' : 'Devolução' }));
  const foraDoPrazo = venda.authorizedAt && agora - Date.parse(venda.authorizedAt) > CANCEL_WINDOW_MS;
  if (order.status === 'cancelled' && foraDoPrazo) linhas.unshift({ key: 'cancelamento', titulo: 'Pedido cancelado (todas as peças)' });
  if (!linhas.length) return null;

  async function emitir(key: string) {
    setBusy(key); setError('');
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/orders/${orderId}/nfe-devolucao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ devolucao: key, environment: env }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? 'Não foi possível emitir agora.');
    } catch { setError('Sem conexão. Tente de novo.'); } finally { setBusy(''); }
  }

  return (
    <section aria-label="Nota fiscal de devolução" className="border border-mist bg-paper px-5 py-4 rounded-2xl flex flex-col gap-3">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-faint">Nota fiscal de devolução{prod ? '' : ' · teste'}</p>
      <ul className="flex flex-col divide-y divide-mist">
        {linhas.map(l => {
          const n = notas[l.key];
          const pronta = n?.status === 'autorizada';
          return (
            <li key={l.key} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-ink">{l.titulo}</p>
                <p className={`text-[12px] ${n?.status === 'erro' || n?.status === 'pendente_dados' ? 'text-red-600' : 'text-mid'}`}>
                  {n ? `${STATUS[n.status] ?? n.status}${n.numero ? ` · nº ${n.numero}` : ''}${n.mensagem ? ` · ${n.mensagem}` : ''}` : 'Ainda não emitida'}
                </p>
              </div>
              {!pronta && (
                <button type="button" onClick={() => emitir(l.key)} disabled={!!busy}
                  className="shrink-0 border border-ink text-ink text-[11px] font-bold uppercase tracking-wide px-3.5 py-2 hover:bg-ink hover:text-paper transition-colors disabled:opacity-50 rounded-full">
                  {busy === l.key ? 'Emitindo…' : n ? 'Tentar de novo' : 'Emitir nota'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="text-[12px] text-red-600">{error}</p>}
      <p className="text-[11px] text-faint">Nota de entrada das peças devolvidas, com referência à nota da venda. CFOP e CSOSN em Configurações, Nota fiscal.</p>
    </section>
  );
}
