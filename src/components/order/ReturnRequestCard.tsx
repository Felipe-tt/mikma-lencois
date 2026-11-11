'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/db';
import { MOTIVOS, devolucaoPadrao, motivoFinal, motivoPedeTexto, opcoesDevolucao, returnWindow, type DevolverPor } from '@/lib/returnRequest';
import { formatCurrency } from '@/lib/utils/format';
import { NovasPecas, type Cotacao, type NovaEscolhida } from './NovasPecas';
import type { Order, ReturnRequest } from '@/types';

type Devolucao = ReturnRequest & {
  defeito?: boolean;
  devolverPor?: DevolverPor;
  reversa?: { codigoObjeto: string; validade: string; entregueEm?: string };
  coletaUber?: { coletadoEm?: string; entregueEm?: string };
  recebidaEm?: string;
  saldoCents?: number;
  reenvioOrderId?: string;
};
type Tipo = 'troca' | 'devolucao' | 'defeito';
const ddmm = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

const COMO: Record<DevolverPor, { titulo: string; texto: string; depois: string }> = {
  correios: { titulo: 'Pelos Correios', texto: 'Em qualquer agência, sem pagar.', depois: 'Aprovado, você recebe um código para postar nos Correios sem pagar nada.' },
  uber: { titulo: 'Buscamos na sua casa', texto: 'Um entregador da Uber vai até você, sem custo.', depois: 'Aprovado, a loja combina o horário com você e manda um entregador buscar, sem custo.' },
  loja: { titulo: 'Entrego na loja', texto: 'No balcão, quando puder.', depois: 'Aprovado, é só levar as peças na loja.' },
};

const dia = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

/**
 * Troca ou devolução pelo próprio pedido: o cliente escolhe as peças e conta
 * o que houve; a loja aprova no painel. As peças voltam como o pedido
 * chegou (código dos Correios ou entregador da Uber) ou na loja, sem custo.
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
  const [motivo, setMotivo] = useState('');
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(order.items.map(i => [i.sku, order.items.length === 1 ? i.quantity : 0])));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [semUso, setSemUso] = useState(false);
  const [fotos, setFotos] = useState<{ blob: Blob; url: string }[]>([]);
  const [lendoFoto, setLendoFoto] = useState(false);
  const [por, setPor] = useState<DevolverPor>(() => devolucaoPadrao(order));
  const [troca, setTroca] = useState<{ novos: NovaEscolhida[]; cotacao: Cotacao | null; pronto: boolean }>({ novos: [], cotacao: null, pronto: false });

  async function addFotos(files: File[]) {
    if (!files.length) return;
    setLendoFoto(true); setError('');
    try {
      const { compressPhoto } = await import('@/lib/images/compressPhoto');
      const novas: { blob: Blob; url: string }[] = [];
      for (const f of files.slice(0, 4 - fotos.length)) {
        if (!f.type.startsWith('image/')) continue;
        const blob = await compressPhoto(f);
        novas.push({ blob, url: URL.createObjectURL(blob) });
      }
      setFotos(prev => [...prev, ...novas].slice(0, 4));
    } catch {
      setError('Não deu para ler uma das fotos. Tente outra.');
    } finally { setLendoFoto(false); }
  }

  /** Sobe as fotos para a pasta do cliente no Storage e devolve os caminhos. */
  async function enviarFotos(): Promise<string[]> {
    if (!fotos.length) return [];
    const [{ storage }, { ref, uploadBytes }] = await Promise.all([import('@/lib/firebase/storage'), import('firebase/storage')]);
    const base = `returns/${user.uid}/${Date.now()}`;
    return Promise.all(fotos.map(async (f, i) => {
      const path = `${base}_${i}.jpg`;
      await uploadBytes(ref(storage, path), f.blob, { contentType: 'image/jpeg' });
      return path;
    }));
  }

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
    const conferido = motivoFinal(tipo, motivo || undefined, reason);
    if (!conferido.ok) { setError(conferido.error); return; }
    if (tipo !== 'defeito' && !semUso) { setError('Confirme que as peças não foram lavadas nem usadas.'); return; }
    if (tipo !== 'devolucao' && !troca.pronto) { setError('Escolha a peça nova e espere o valor ser calculado.'); return; }
    setSending(true); setError('');
    try {
      let caminhos: string[];
      try { caminhos = await enviarFotos(); } catch { setError('Não deu para enviar as fotos. Confira a conexão e tente de novo.'); return; }
      const res = await fetch(`/api/orders/${order.id}/troca`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ type: tipo === 'devolucao' ? 'devolucao' : 'troca', defeito: tipo === 'defeito', semUso: tipo !== 'defeito' && semUso, motivo, reason: reason.trim(), devolverPor: por, items, ...(tipo !== 'devolucao' ? { novos: troca.novos } : {}), ...(caminhos.length ? { fotos: caminhos } : {}) }),
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
    const porAtual = current.devolverPor ?? 'correios';
    const chegou = !!(r?.entregueEm || current.coletaUber?.entregueEm || current.recebidaEm);
    const texto = current.status === 'solicitada'
      ? 'Recebemos seu pedido. A loja responde em até 1 dia útil.'
      : current.status === 'aprovada'
        ? chegou
          ? 'As peças chegaram na loja. Estamos conferindo e já te avisamos.'
          : porAtual === 'uber'
            ? current.coletaUber
              ? current.coletaUber.coletadoEm ? 'O entregador já pegou o pacote e está levando para a loja.' : 'Um entregador da Uber está indo buscar as peças. Deixe o pacote pronto.'
              : 'Aprovado! A loja vai combinar o horário com você e mandar um entregador da Uber buscar as peças, sem custo.'
            : porAtual === 'loja'
              ? 'Aprovado! Leve as peças na loja quando puder, no horário de funcionamento.'
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
        {current.status === 'aprovada' && current.reenvioOrderId && (current.saldoCents ?? 0) > 0 && (
          <Link href={`/pedidos/${current.reenvioOrderId}`}
            className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-warm px-3 py-2.5 text-[13px] text-ink hover:bg-warm/70">
            <span>Pague {formatCurrency(current.saldoCents!)} (diferença e frete) para receber a peça nova</span>
            <span className="font-semibold text-clay shrink-0">Pagar</span>
          </Link>
        )}
        <Link href={`/pedidos/${order.id}/troca`}
          className="mt-4 inline-flex items-center gap-1.5 h-10 px-4 rounded-full border border-ink text-[13px] font-semibold text-ink hover:bg-ink hover:text-paper transition-colors">
          {current.status === 'aprovada' && r && !r.entregueEm ? 'Ver código e como enviar' : 'Acompanhar troca'}
        </Link>
        {current.status === 'recusada' && noPrazo && (
          <button type="button" onClick={() => setOpen(true)}
            className="mt-3 text-[13px] font-semibold text-clay hover:text-clay-d underline underline-offset-2">
            Fazer um novo pedido
          </button>
        )}
      </section>
    );
  }

  // Fora de qualquer prazo: nada aparece (dúvidas seguem pelo WhatsApp do pedido).
  if (!janela.ok) return null;

  if (!open) {
    // Depois dos 7 dias só sobra defeito (CDC art. 26): fica disponível, mas discreto.
    if (!trocaOk) {
      return (
        <button type="button" onClick={() => setOpen(true)}
          className="self-start text-[12px] text-faint underline underline-offset-2 hover:text-mid transition-colors">
          Problema com o produto?
        </button>
      );
    }
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="w-full rounded-2xl border border-mist p-4 text-left hover:border-ink transition-colors">
        <span className="block text-[14px] font-semibold text-ink">Pedir troca ou devolução</span>
        <span className="block text-[12.5px] text-mid mt-0.5">Até {ddmm(janela.trocaAte)}, com as peças sem lavar e sem usar.</span>
      </button>
    );
  }

  return (
    <section className="rounded-2xl border border-ink/30 p-5 flex flex-col gap-4" aria-label="Pedir troca ou devolução">
      <h2 className="font-display font-normal text-ink text-[1.15rem] leading-tight">{tipo === 'defeito' ? 'Problema com o produto' : 'Pedir troca ou devolução'}</h2>
      {trocaOk && tipo !== 'defeito' && (
        <div role="radiogroup" aria-label="O que você prefere" className="grid grid-cols-2 gap-2">
          {([['troca', 'Trocar'], ['devolucao', 'Devolver']] as const).map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={tipo === v} onClick={() => { setType(v); setMotivo(''); }}
              className={`h-11 rounded-xl border text-[13px] font-semibold transition-colors ${tipo === v ? 'border-ink bg-ink text-paper' : 'border-mist text-ink hover:border-ink'}`}>
              {label}
            </button>
          ))}
        </div>
      )}
      {tipo === 'defeito' && <p className="text-[12.5px] text-mid leading-relaxed">Conte o que aconteceu e, se puder, mande fotos do problema.</p>}
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
      {tipo !== 'devolucao' && (
        <NovasPecas order={order} qty={qty} defeito={tipo === 'defeito'} getToken={() => user.getIdToken()} onChange={setTroca} />
      )}
      <div className="flex flex-col gap-2">
        <span id="motivo-label" className="text-[12px] font-semibold text-mid">{tipo === 'defeito' ? 'Qual é o problema?' : 'Qual o motivo?'}</span>
        <div role="radiogroup" aria-labelledby="motivo-label" className="flex flex-wrap gap-2">
          {MOTIVOS[tipo].map(m => (
            <button key={m} type="button" role="radio" aria-checked={motivo === m} onClick={() => { setMotivo(m); setError(''); }}
              className={`h-9 px-3.5 rounded-full border text-[12.5px] transition-colors ${motivo === m ? 'border-ink bg-ink text-paper font-semibold' : 'border-mist text-ink hover:border-ink'}`}>
              {m}
            </button>
          ))}
        </div>
        {motivo === 'Não coube no colchão' && (
          <p className="text-[12px] text-mid leading-relaxed">
            Dica: meça a altura do colchão e confira no <Link href="/guia-de-tamanhos" className="text-clay underline underline-offset-2">guia de tamanhos</Link> antes de escolher o novo.
          </p>
        )}
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold text-mid">{motivo && motivoPedeTexto(motivo) ? (tipo === 'defeito' ? 'Conte qual é o defeito' : 'Conte o que aconteceu') : 'Quer contar mais? (opcional)'}</span>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={600}
          placeholder={tipo === 'defeito' ? 'Ex.: o furo fica perto da barra' : motivo === 'Não coube no colchão' ? 'Ex.: o colchão tem 30 cm de altura, quero o de elástico maior' : 'Ex.: quero trocar pelo tamanho queen'}
          className="rounded-xl border border-mist bg-paper px-3 py-2.5 text-[14px] text-ink focus:outline-none focus:border-ink" />
      </label>
      {tipo !== 'devolucao' && (
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-semibold text-mid">Fotos {tipo === 'defeito' ? '(ajudam a resolver mais rápido)' : '(opcional)'}</span>
          <div className="flex flex-wrap gap-2">
            {fotos.map((f, i) => (
              <div key={f.url} className="relative w-16 h-16">
                <img src={f.url} alt={`Foto ${i + 1}`} className="w-16 h-16 rounded-lg object-cover border border-mist" />
                <button type="button" aria-label={`Tirar a foto ${i + 1}`}
                  onClick={() => { URL.revokeObjectURL(f.url); setFotos(prev => prev.filter(x => x !== f)); }}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-ink text-paper text-[11px] leading-none grid place-items-center">×</button>
              </div>
            ))}
            {fotos.length < 4 && (
              <label className="w-16 h-16 rounded-lg border border-dashed border-mist-d grid place-items-center text-faint hover:border-ink hover:text-ink cursor-pointer transition-colors">
                <input type="file" accept="image/*" multiple className="sr-only" disabled={lendoFoto}
                  onChange={e => { const lista = [...(e.target.files ?? [])]; e.target.value = ''; void addFotos(lista); }} aria-label="Adicionar fotos" />
                {lendoFoto ? <span className="spinner w-4 h-4" /> : <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>}
              </label>
            )}
          </div>
          <span className="text-[11px] text-faint">Até 4 fotos.</span>
        </div>
      )}
      {tipo !== 'defeito' && (
        <label className="flex items-start gap-2.5 text-[13px] text-ink leading-snug">
          <input type="checkbox" checked={semUso} onChange={e => setSemUso(e.target.checked)} className="mt-0.5 h-4 w-4 accent-ink" />
          <span>As peças não foram lavadas nem usadas.</span>
        </label>
      )}
      {opcoesDevolucao(order).length > 1 && (
        <div className="flex flex-col gap-2">
          <span id="devolver-label" className="text-[12px] font-semibold text-mid">Como devolver as peças?</span>
          <div role="radiogroup" aria-labelledby="devolver-label" className="grid grid-cols-2 gap-2">
            {opcoesDevolucao(order).map(v => (
              <button key={v} type="button" role="radio" aria-checked={por === v} onClick={() => setPor(v)}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${por === v ? 'border-ink bg-warm/60' : 'border-mist hover:border-ink'}`}>
                <span className="block text-[13px] font-semibold text-ink">{COMO[v].titulo}</span>
                <span className="block text-[11.5px] text-mid leading-snug mt-0.5">{COMO[v].texto}</span>
              </button>
            ))}
          </div>
        </div>
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
      <p className="text-[11.5px] text-faint">{COMO[por].depois}</p>
      {trocaOk && (
        <button type="button" onClick={() => { setType(tipo === 'defeito' ? 'troca' : 'defeito'); setMotivo(''); setError(''); }}
          className="self-start text-[11.5px] text-faint underline underline-offset-2 hover:text-mid">
          {tipo === 'defeito' ? 'Voltar para troca ou devolução' : 'O produto veio com defeito?'}
        </button>
      )}
    </section>
  );
}
