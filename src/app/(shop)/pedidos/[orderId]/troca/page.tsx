'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/db';
import { useAuth } from '@/lib/auth/AuthContext';
import { setReturnTo } from '@/lib/auth/returnTo';
import { variantLabel } from '@/lib/variantLabel';
import { returnWindow } from '@/lib/returnRequest';
import { diasParaPostar, etapasDaTroca, type EtapaId } from '@/lib/returns/returnSteps';
import { TrackingTimeline } from '@/components/tracking/TrackingTimeline';
import { EmptyState } from '@/components/ui/EmptyState';
import { OrderDetailSkeleton } from '@/components/ui/Skeleton';
import { ReturnPhotos } from '@/components/order/ReturnPhotos';
import { BusinessHoursCard } from '@/components/storefront/BusinessHoursCard';
import type { ColetaUber, DevolverPor } from '@/lib/returns/returnSteps';
import type { Order, ReturnRequest } from '@/types';

type Troca = ReturnRequest & {
  defeito?: boolean;
  fotos?: string[];
  reversa?: { codigoObjeto: string; validade: string; createdAt?: string; postadoEm?: string; entregueEm?: string };
  devolverPor?: DevolverPor;
  coletaUber?: ColetaUber;
  recebidaEm?: string;
};

interface Loja { endereco: string; mapa: string; horario?: string; fuso?: string }

const dataLonga = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
const dataCurta = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '');

/**
 * Página da troca ou devolução: em que pé está e como as peças voltam.
 * Correios: o código em destaque (com prazo e botão de copiar), como enviar
 * e o rastreio. Uber: o entregador que vai buscar. Loja: endereço e horário. O pedido mostra um resumo com o link para cá, e os
 * e-mails da troca trazem o cliente direto para esta página.
 */
export default function TrocaPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { buyer: user, loading } = useAuth();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [trocas, setTrocas] = useState<Troca[] | null>(null);
  const [whats, setWhats] = useState<string | null>(null);
  const [loja, setLoja] = useState<Loja | null>(null);

  useEffect(() => {
    if (!loading && !user) { setReturnTo(window.location.pathname); router.replace('/entrar'); }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !orderId) return;
    const offOrder = onSnapshot(doc(db, 'orders', orderId), s => setOrder(s.exists() ? ({ id: s.id, ...s.data() } as Order) : null), () => setOrder(null));
    const offTrocas = onSnapshot(
      query(collection(db, 'returns'), where('orderId', '==', orderId), where('userId', '==', user.uid)),
      s => setTrocas(s.docs.map(d => ({ id: d.id, ...d.data() }) as Troca).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))),
      () => setTrocas([]),
    );
    return () => { offOrder(); offTrocas(); };
  }, [user, orderId]);

  useEffect(() => {
    fetch('/api/settings/public').then(r => r.json()).then(d => {
      const url = d.whatsappUrl || (d.storePhone ? `https://wa.me/55${String(d.storePhone).replace(/\D/g, '').replace(/^55/, '')}` : null);
      const rua = [`${d.storeAddress ?? ''}${d.storeNumber ? `, ${d.storeNumber}` : ''}`, d.storeNeighborhood, d.storeCity].filter(Boolean).join(', ');
      if (d.storeAddress) setLoja({ endereco: rua, mapa: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${rua} ${d.storeState ?? ''}`)}`, horario: d.businessHours, fuso: d.businessHoursTimezone });
      if (url) setWhats(`${url}${url.includes('?') ? '&' : '?'}text=${encodeURIComponent(`Olá! Tenho uma dúvida sobre a troca do pedido #${orderId.slice(-8).toUpperCase()}.`)}`);
    }).catch(() => {});
  }, [orderId]);

  if (loading || trocas === null) return <OrderDetailSkeleton />;
  const t = trocas[0];
  const short = orderId.slice(-8).toUpperCase();
  const voltar = (
    <Link href={`/pedidos/${orderId}`} className="inline-flex items-center gap-1.5 text-[13px] text-mid hover:text-ink transition-colors">
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
      Pedido #{short}
    </Link>
  );

  if (!t) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 flex flex-col gap-6">
        {voltar}
        <EmptyState
          title="Nenhuma troca neste pedido"
          description="Para pedir troca ou devolução, use o botão na página do pedido."
          actions={[{ label: 'Ir para o pedido', href: `/pedidos/${orderId}`, variant: 'primary' }]}
        />
      </div>
    );
  }

  const { etapas, atual } = etapasDaTroca(t);
  const r = t.reversa;
  const por = t.devolverPor ?? 'correios';
  const u = t.coletaUber;
  const tipo = t.defeito ? 'Troca por defeito' : t.type === 'troca' ? 'Troca' : 'Devolução';
  const dias = r ? diasParaPostar(r.validade) : 0;
  const podeNovo = t.status === 'recusada' && !!order && returnWindow(order).ok;
  const fotos = new Map((order?.items ?? []).map(i => [i.sku, i.image]));

  const titulo: Record<EtapaId | 'recusada', [string, string]> = {
    solicitada: ['Recebemos seu pedido', 'A loja responde em até 1 dia útil. Você recebe a resposta por e-mail e aqui.'],
    aprovada: por === 'uber'
      ? u
        ? ['O entregador está indo buscar', 'Deixe o pacote pronto e entregue ao entregador da Uber quando ele chegar. É por nossa conta.']
        : ['Vamos buscar na sua casa', 'A loja vai combinar o horário com você e mandar um entregador da Uber. Deixe as peças embaladas.']
      : por === 'loja'
        ? ['Leve as peças na loja', 'Quando puder, no horário de funcionamento. Não precisa agendar.']
        : r
          ? ['Leve o pacote aos Correios', `Até ${dataLonga(r.validade)}${dias > 0 ? ` (faltam ${dias} ${dias === 1 ? 'dia' : 'dias'})` : ', hoje é o último dia'}. O envio é por nossa conta.`]
          : ['Aprovada', 'A loja está gerando o seu código dos Correios. Ele aparece aqui e no seu e-mail.'],
    postada: por === 'uber'
      ? ['A caminho da loja', 'O entregador já pegou o pacote e está levando para a loja.']
      : ['A caminho da loja', 'Os Correios já estão com o seu pacote. Acompanhe o trajeto aqui embaixo.'],
    chegou: ['Chegou na loja', 'Estamos conferindo as peças e já te avisamos.'],
    concluida: ['Concluída', t.type === 'troca' ? 'Se a troca gerou um envio novo, o rastreio chega por e-mail e aparece no pedido.' : 'O valor volta pelo mesmo meio de pagamento da compra.'],
    recusada: ['Não foi aprovada', 'Se tiver dúvida sobre o motivo, fale com a gente pelo WhatsApp.'],
  };
  const [h1, sub] = titulo[atual];
  const mostraCodigo = por === 'correios' && !!r && t.status === 'aprovada' && !r.postadoEm && !r.entregueEm;
  const mostraEntregador = por === 'uber' && !!u?.trackingUrl && !u.entregueEm && t.status === 'aprovada';
  const mostraLoja = por === 'loja' && t.status === 'aprovada' && !t.recebidaEm && !!loja;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-10 flex flex-col gap-8">
      {voltar}

      <header className="flex flex-col gap-2">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-clay">{tipo} · pedido #{short}</p>
        <h1 className="font-display text-ink text-[2rem] sm:text-[2.4rem] leading-tight text-balance">{h1}</h1>
        <p className="text-[15px] text-mid leading-relaxed max-w-[56ch]">{sub}</p>
        {podeNovo && (
          <Link href={`/pedidos/${orderId}`} className="self-start mt-2 btn-outline">Fazer um novo pedido</Link>
        )}
      </header>

      {atual !== 'recusada' && (
        <ol aria-label="Etapas da troca" className={`grid gap-1 ${etapas.length === 4 ? 'grid-cols-4' : 'grid-cols-5'}`}>
          {etapas.map((e, i) => {
            const isAtual = e.id === atual;
            return (
              <li key={e.id} className="flex flex-col items-center text-center gap-2 relative">
                {i > 0 && <span aria-hidden="true" className={`absolute top-[13px] right-1/2 w-full h-0.5 -z-0 ${e.feita ? 'bg-clay-l' : 'bg-mist'}`} />}
                <span className={`relative z-10 w-7 h-7 rounded-full grid place-items-center border-2 ${
                  e.feita && !isAtual ? 'bg-clay-l border-clay-l text-paper' : isAtual ? 'bg-paper border-clay-l text-clay-l' : 'bg-paper border-mist text-faint'
                }`}>
                  {e.feita && !isAtual
                    ? <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                    : <span className={`w-2 h-2 rounded-full ${isAtual ? 'bg-clay-l' : 'bg-mist-d'}`} />}
                </span>
                <span className={`text-[11px] leading-tight ${e.feita ? 'text-ink font-medium' : 'text-faint'}`}>
                  {e.label}
                  {e.feita && e.quando && <span className="block text-faint font-normal tabular-nums">{dataCurta(e.quando)}</span>}
                </span>
                <span className="sr-only">{isAtual ? '(etapa atual)' : e.feita ? '(concluída)' : '(pendente)'}</span>
              </li>
            );
          })}
        </ol>
      )}

      {mostraEntregador && u && (
        <section aria-label="Entregador da Uber" className="rounded-3xl border border-mist bg-warm/60 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">Coleta pela Uber</p>
            <p className="text-[15px] text-ink mt-1 leading-snug">{u.coletadoEm ? 'O pacote está a caminho da loja.' : 'Veja no mapa quando o entregador vai chegar.'}</p>
          </div>
          <a href={u.trackingUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-11 px-5 rounded-full bg-ink text-paper text-[13px] font-semibold hover:bg-clay transition-colors">
            Acompanhar o entregador
          </a>
        </section>
      )}

      {mostraLoja && loja && (
        <section aria-labelledby="onde-entregar" className="flex flex-col gap-3">
          <h2 id="onde-entregar" className="text-xs font-bold tracking-[0.15em] uppercase text-faint">Onde entregar</h2>
          <div className="rounded-2xl border border-mist p-5 flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="flex-1 text-[15px] text-ink leading-snug">{loja.endereco}</p>
            <a href={loja.mapa} target="_blank" rel="noopener noreferrer" className="btn-outline self-start sm:self-auto">Ver no mapa</a>
          </div>
          {loja.horario && <BusinessHoursCard businessHours={loja.horario} timezone={loja.fuso} />}
          <p className="text-[12.5px] text-faint leading-relaxed">Leve as peças embaladas e diga o número do pedido (#{short}) no balcão.</p>
        </section>
      )}

      {mostraCodigo && r && (
        <section aria-label="Código de postagem" className="rounded-3xl border-2 border-dashed border-clay-l/60 bg-warm/60 p-5 sm:p-7 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">Código de postagem dos Correios</p>
            <p className="font-mono text-[1.6rem] sm:text-[2rem] font-bold text-ink tracking-[0.08em] break-all select-all">{r.codigoObjeto}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <CopiarCodigo code={r.codigoObjeto} />
            <p className="text-[13px] text-mid">Válido até <strong className="text-ink font-semibold">{dataCurta(r.validade)}</strong></p>
          </div>
          <p className="text-[12.5px] text-faint leading-relaxed">Os Correios também mandaram este código para o seu e-mail. Não precisa imprimir nada.</p>
        </section>
      )}

      {mostraCodigo && (
        <section aria-labelledby="como-enviar" className="flex flex-col gap-4">
          <h2 id="como-enviar" className="text-xs font-bold tracking-[0.15em] uppercase text-faint">Como enviar</h2>
          <ol className="flex flex-col gap-4">
            {[
              ['Embale as peças', 'Em qualquer caixa ou saco bem fechado. Se ainda tiver a etiqueta e a embalagem original, melhor.'],
              ['Leve a uma agência dos Correios', `Qualquer agência do Brasil, até ${dataCurta(r?.validade)}.`],
              ['Informe o código no balcão', 'O atendente imprime a etiqueta. Você não paga nada e recebe o comprovante.'],
            ].map(([titulo, texto], i) => (
              <li key={titulo} className="grid grid-cols-[28px_1fr] gap-3">
                <span className="w-7 h-7 rounded-full bg-ink text-paper grid place-items-center text-[12px] font-bold tabular-nums">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-ink">{titulo}</p>
                  <p className="text-[13.5px] text-mid leading-relaxed">{texto}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {por === 'correios' && r && (r.postadoEm || r.entregueEm || atual === 'concluida') && (
        <section aria-labelledby="rastreio-volta" className="flex flex-col gap-3">
          <h2 id="rastreio-volta" className="text-xs font-bold tracking-[0.15em] uppercase text-faint">Rastreio da devolução</h2>
          <div className="rounded-2xl border border-mist p-5">
            <p className="text-xs text-faint">Correios · {r.codigoObjeto}</p>
            <div className="mt-3"><TrackingTimeline trackingCode={r.codigoObjeto} carrierName="Correios" /></div>
          </div>
        </section>
      )}

      <section aria-labelledby="pecas" className="flex flex-col gap-3">
        <h2 id="pecas" className="text-xs font-bold tracking-[0.15em] uppercase text-faint">{t.type === 'troca' ? 'Peças para trocar' : 'Peças devolvidas'}</h2>
        <ul className="rounded-2xl border border-mist divide-y divide-mist">
          {t.items.map(i => {
            const foto = fotos.get(i.sku);
            const v = variantLabel(i.variant);
            return (
              <li key={i.sku} className="flex items-center gap-3 p-4">
                {foto
                  ? <img src={foto} alt="" width={48} height={48} className="w-12 h-12 rounded-lg object-cover bg-warm shrink-0" />
                  : <span aria-hidden="true" className="w-12 h-12 rounded-lg bg-warm shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] text-ink leading-snug">{i.productName}</p>
                  {v && <p className="text-[12.5px] text-faint">{v}</p>}
                </div>
                <span className="text-[13px] text-mid tabular-nums shrink-0">{i.quantity}×</span>
              </li>
            );
          })}
        </ul>
        <ReturnPhotos paths={t.fotos} />
        {t.reason && t.reason !== 'Desistiu da compra.' && (
          <p className="text-[13.5px] text-mid leading-relaxed"><span className="text-faint">Motivo:</span> {t.reason}</p>
        )}
      </section>

      <section className="rounded-2xl bg-warm/60 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-[13.5px] text-ink flex-1">Alguma dúvida sobre a troca?</p>
        {whats
          ? <a href={whats} target="_blank" rel="noopener noreferrer" className="btn-outline self-start">Falar no WhatsApp</a>
          : <Link href="/trocas-e-devolucoes" className="btn-outline self-start">Ver a política de trocas</Link>}
      </section>
    </div>
  );
}

function CopiarCodigo({ code }: { code: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  function flash(s: 'copied' | 'failed') { setState(s); setTimeout(() => setState('idle'), 1800); }
  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!navigator.clipboard) { flash('failed'); return; }
          navigator.clipboard.writeText(code).then(() => flash('copied'), () => flash('failed'));
        }}
        className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-ink text-paper text-[13px] font-semibold hover:bg-clay transition-colors"
      >
        {state === 'copied' ? 'Código copiado' : 'Copiar código'}
      </button>
      <span role="status" className="sr-only">
        {state === 'copied' ? 'Código copiado' : state === 'failed' ? 'Não deu para copiar. Selecione o código e copie.' : ''}
      </span>
    </>
  );
}
