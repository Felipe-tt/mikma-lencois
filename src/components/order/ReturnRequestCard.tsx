'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/db';
import { returnWindow } from '@/lib/returnRequest';
import type { Order, ReturnRequest } from '@/types';

type Devolucao = ReturnRequest & { defeito?: boolean; reversa?: { codigoObjeto: string; validade: string; entregueEm?: string } };
type Tipo = 'troca' | 'devolucao' | 'defeito';
const ddmm = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

const dia = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

/**
 * Troca ou devolução pelo próprio pedido: o cliente escolhe as peças e conta
 * o que houve; a loja aprova no painel e gera o código dos Correios, que
 * aparece aqui (e chega por e-mail) para postar sem custo.
 */
export function ReturnRequestCard({ order, user, whatsappHref }: {
  order: Order;
  user: { uid: string; getIdToken: () => Promise<string> };
  /** Link do WhatsApp da loja, para quando o prazo já passou. */
  whatsappHref?: string | null;
}) {
  const [requests, setRequests] = useState<Devolucao[] | null>(null);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<Tipo>('troca');
  const [reason, setReason] = useState('');
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(order.items.map(i => [i.sku, order.items.length === 1 ? i.quantity : 0])));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [semUso, setSemUso] = useState(false);

  useEffect(() => onSnapshot(
    query(collection(db, 'returns'), where('orderId', '==', order.id), where('userId', '==', user.uid)),
    snap => setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Devolucao).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))),
    () => setRequests([]),
  ), [order.id, user.uid]);

  if (requests === null) return null;
  const current = requests[0];
  const ativa = current && (current.status === 'solicitada' || current.status === 'aprovada');
  const janela = returnWindow(order);
  const noPrazo = janela.ok;
  const trocaOk = janela.ok && janela.troca;
  // Passados os 7 dias, só sobra defeito.
  const tipo: Tipo = trocaOk ? type : 'defeito';

  async function send() {
    const items = Object.entries(qty).filter(([, q]) => q > 0).map(([sku, quantity]) => ({ sku, quantity }));
    if (!items.length) { setError('Escolha pelo menos uma peça.'); return; }
    if (tipo !== 'devolucao' && reason.trim().length < 10) { setError(tipo === 'defeito' ? 'Conte qual é o defeito.' : 'Conte em poucas palavras o que aconteceu.'); return; }
    if (tipo !== 'defeito' && !semUso) { setError('Confirme que as peças não foram lavadas nem usadas.'); return; }
    setSending(true); setError('');
    try {
      const res = await fetch(`/api/orders/${order.id}/troca`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ type: tipo === 'devolucao' ? 'devolucao' : 'troca', defeito: tipo === 'defeito', semUso: tipo !== 'defeito' && semUso, reason: reason.trim(), items }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? 'Não foi possível enviar agora. Tente de novo.');
      else setOpen(false);
    } catch {
      setError('Sem conexão. Tente de novo.');
    } finally { setSending(false); }
  }

  if (current && (ativa || current.status === 'concluida' || (current.status === 'recusada' && !open))) {
    const r = current.reversa;
    const texto = current.status === 'solicitada'
      ? 'Recebemos seu pedido. A loja responde em até 1 dia útil.'
      : current.status === 'aprovada'
        ? r?.entregueEm
          ? 'O pacote chegou na loja. Estamos conferindo e já te avisamos.'
          : r
            ? `Leve o pacote a qualquer agência dos Correios até ${dia(r.validade)} e informe o código abaixo. O envio é por nossa conta.`
            : 'Aprovado! A loja vai gerar o código para você enviar pelos Correios sem custo.'
        : current.status === 'concluida' ? 'Concluído. Obrigado pela paciência.'
          : 'Não foi aprovado. Se tiver dúvida, fale com a loja.';
    return (
      <section className="rounded-2xl border border-mist p-5" aria-label="Troca ou devolução">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-faint">{current.defeito ? 'Troca por defeito' : current.type === 'troca' ? 'Troca' : 'Devolução'}</p>
        <p className="text-[14px] text-ink mt-1 leading-relaxed">{texto}</p>
        {current.status === 'aprovada' && r && !r.entregueEm && (
          <p className="mt-3 rounded-xl bg-warm px-3 py-2.5">
            <span className="block text-[11px] text-faint">Código de postagem dos Correios</span>
            <span className="font-mono text-[16px] font-bold text-ink tracking-wide">{r.codigoObjeto}</span>
          </p>
        )}
        {current.status === 'recusada' && noPrazo && (
          <button type="button" onClick={() => setOpen(true)}
            className="mt-3 text-[13px] font-semibold text-clay hover:text-clay-d underline underline-offset-2">
            Fazer um novo pedido
          </button>
        )}
      </section>
    );
  }

  if (!janela.ok) {
    if (order.status !== 'delivered') return null;
    return (
      <p className="rounded-2xl border border-mist p-4 text-[12.5px] text-mid leading-relaxed">
        {janela.reason.replace(/ Fale com a gente pelo WhatsApp\.$/, '')}{' '}
        {whatsappHref
          ? <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="font-semibold text-clay underline underline-offset-2">Fale com a gente pelo WhatsApp</a>
          : 'Fale com a gente pelo WhatsApp.'}
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="w-full rounded-2xl border border-mist p-4 text-left hover:border-ink transition-colors">
        <span className="block text-[14px] font-semibold text-ink">{trocaOk ? 'Pedir troca ou devolução' : 'Veio com defeito?'}</span>
        <span className="block text-[12.5px] text-mid mt-0.5">
          {trocaOk
            ? `Até ${ddmm(janela.trocaAte)}, com as peças sem lavar e sem usar.`
            : `Avise até ${ddmm(janela.defeitoAte)} e a gente resolve.`}
        </span>
      </button>
    );
  }

  return (
    <section className="rounded-2xl border border-ink/30 p-5 flex flex-col gap-4" aria-label="Pedir troca ou devolução">
      <h2 className="font-display font-normal text-ink text-[1.15rem] leading-tight">{trocaOk ? 'Pedir troca ou devolução' : 'Troca por defeito'}</h2>
      {trocaOk ? (
        <div role="radiogroup" aria-label="O que você prefere" className="grid grid-cols-3 gap-2">
          {([['troca', 'Trocar'], ['devolucao', 'Devolver'], ['defeito', 'Defeito']] as const).map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={tipo === v} onClick={() => setType(v)}
              className={`h-11 rounded-xl border text-[13px] font-semibold transition-colors ${tipo === v ? 'border-ink bg-ink text-paper' : 'border-mist text-ink hover:border-ink'}`}>
              {label}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[12.5px] text-mid leading-relaxed">Troca e devolução valem até 7 dias depois da entrega. Agora, só por defeito: conte o que aconteceu e mande fotos pelo WhatsApp.</p>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-[12px] font-semibold text-mid mb-1">Quais peças?</legend>
        {order.items.map(i => (
          <label key={i.sku} className="flex items-center justify-between gap-3 text-[13px] text-ink">
            <span className="min-w-0">{i.productName}</span>
            <select value={qty[i.sku] ?? 0} onChange={e => setQty(q => ({ ...q, [i.sku]: Number(e.target.value) }))}
              aria-label={`Quantidade de ${i.productName}`}
              className="shrink-0 h-9 rounded-lg border border-mist bg-paper px-2 text-[13px]">
              {Array.from({ length: i.quantity + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold text-mid">{tipo === 'defeito' ? 'Qual é o defeito?' : tipo === 'devolucao' ? 'Quer contar o motivo? (opcional)' : 'O que aconteceu?'}</span>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={600}
          placeholder={tipo === 'defeito' ? 'Ex.: veio com um furo na costura' : 'Ex.: o tamanho ficou pequeno'}
          className="rounded-xl border border-mist bg-paper px-3 py-2.5 text-[14px] text-ink focus:outline-none focus:border-ink" />
      </label>
      {tipo !== 'defeito' && (
        <label className="flex items-start gap-2.5 text-[13px] text-ink leading-snug">
          <input type="checkbox" checked={semUso} onChange={e => setSemUso(e.target.checked)} className="mt-0.5 h-4 w-4 accent-ink" />
          <span>As peças não foram lavadas nem usadas.</span>
        </label>
      )}
      {error && <p role="alert" className="text-[12.5px] text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => { setOpen(false); setError(''); }}
          className="h-11 px-4 rounded-full border border-mist text-[13px] text-mid hover:border-ink">Voltar</button>
        <button type="button" onClick={send} disabled={sending}
          className="flex-1 h-11 rounded-full bg-ink text-paper text-[13px] font-semibold hover:bg-clay transition-colors disabled:opacity-50">
          {sending ? 'Enviando…' : 'Enviar pedido'}
        </button>
      </div>
      <p className="text-[11.5px] text-faint">Aprovado, você recebe um código para postar nos Correios sem pagar nada.</p>
    </section>
  );
}
