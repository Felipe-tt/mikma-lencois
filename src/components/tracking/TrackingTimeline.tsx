'use client';

import { useEffect, useState, useCallback } from 'react';
import type { TrackingResult } from '@/app/api/tracking/[code]/route';

interface Props {
  // Passa trackingCode para Correios (via Link&Track)
  // Passa orderId para qualquer carrier via Melhor Envio
  trackingCode?: string;
  orderId?: string;
  carrierName?: string;
}

// SVG inline — sem emojis
function StatusIcon({ status, active }: { status: string; active: boolean }) {
  const s = status.toLowerCase();
  const cls = `w-4 h-4 ${active ? 'stroke-white' : 'stroke-[#B09C8C]'}`;
  const base = { fill: 'none' as const, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  if (s.includes('entregue') || s.includes('entrega efetuada'))
    return <svg viewBox="0 0 24 24" className={cls} {...base}><polyline points="20 6 9 17 4 12"/></svg>;
  if (s.includes('saiu para entrega') || s.includes('em rota'))
    return <svg viewBox="0 0 24 24" className={cls} {...base}><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
  if (s.includes('postado') || s.includes('coletado'))
    return <svg viewBox="0 0 24 24" className={cls} {...base}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
  if (s.includes('triagem') || s.includes('encaminhado') || s.includes('transferência'))
    return <svg viewBox="0 0 24 24" className={cls} {...base}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>;
  if (s.includes('chegou') || s.includes('recebido'))
    return <svg viewBox="0 0 24 24" className={cls} {...base}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>;
  if (s.includes('aguardando') || s.includes('etiqueta'))
    return <svg viewBox="0 0 24 24" className={cls} {...base}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
  if (s.includes('tentativa') || s.includes('não entregue') || s.includes('ausente'))
    return <svg viewBox="0 0 24 24" className={cls} {...base}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
  if (s.includes('devolvido') || s.includes('devolução') || s.includes('cancelado'))
    return <svg viewBox="0 0 24 24" className={cls} {...base}><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 00-4-4H4"/></svg>;
  // default dot
  return <svg viewBox="0 0 24 24" className={cls} fill={active ? 'white' : '#B09C8C'}><circle cx="12" cy="12" r="4"/></svg>;
}

function statusColor(status: string, isFirst: boolean): string {
  if (!isFirst) return 'bg-[#E6DFD5]';
  const s = status.toLowerCase();
  if (s.includes('entregue') || s.includes('entrega efetuada')) return 'bg-emerald-500';
  if (s.includes('tentativa') || s.includes('não entregue') || s.includes('ausente') || s.includes('devolvido') || s.includes('cancelado')) return 'bg-amber-400';
  return 'bg-[#C4714A]';
}

export function TrackingTimeline({ trackingCode, orderId, carrierName }: Props) {
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const key = orderId ?? trackingCode;

  const fetch_ = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/tracking/${encodeURIComponent(key)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao buscar rastreio');
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível buscar o rastreio');
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => { fetch_(); }, [fetch_]);

  if (loading) return (
    <div className="flex items-center gap-3 py-4">
      <div className="w-4 h-4 border-2 border-[#C4714A]/30 border-t-[#C4714A] rounded-full animate-spin" />
      <span className="text-[13px] text-[#B09C8C]">Buscando atualizações{carrierName ? ` da ${carrierName}` : ''}…</span>
    </div>
  );

  if (error) return (
    <div className="flex flex-col gap-2 py-3">
      <p className="text-[13px] text-[#705A48]">{error}</p>
      <button onClick={fetch_} className="text-[12px] font-semibold text-[#C4714A] hover:text-[#A05432] transition-colors self-start">
        Tentar novamente
      </button>
    </div>
  );

  // Se não tem eventos mas tem URL externa (ex: Jadlog), mostra link direto
  if (!result || result.events.length === 0) {
    if (result?.trackingUrl) {
      return (
        <div className="py-3 flex flex-col gap-3">
          <p className="text-[13px] text-[#705A48]">
            Rastreie diretamente no site da transportadora para ver os eventos detalhados.
          </p>
          <a
            href={result.trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#C4714A] hover:text-[#A05432] transition-colors"
          >
            Rastrear{carrierName ? ` na ${carrierName}` : ''}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </a>
        </div>
      );
    }
    return (
      <p className="text-[13px] text-[#B09C8C] py-3">
        Ainda sem movimentações registradas. Pode levar até 24h após a postagem.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        {result.service && <p className="text-[11px] text-[#B09C8C]">{result.service}</p>}
        <div className="ml-auto flex items-center gap-3">
          {result.trackingUrl && (
            <a
              href={result.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-semibold text-[#705A48] hover:text-[#1E1208] transition-colors inline-flex items-center gap-1"
            >
              Ver no site
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </a>
          )}
          <button onClick={fetch_} className="text-[11px] font-semibold text-[#C4714A] hover:text-[#A05432] transition-colors">
            Atualizar
          </button>
        </div>
      </div>

      <div className="relative">
        <div className="absolute left-[18px] top-5 bottom-5 w-px bg-[#E6DFD5]" />
        <div className="flex flex-col gap-5">
          {result.events.map((ev, i) => (
            <div key={i} className="flex items-start gap-4">
              <div className={`w-9 h-9 shrink-0 flex items-center justify-center relative z-10 ${statusColor(ev.status, i === 0)}`}>
                <StatusIcon status={ev.status} active={i === 0} />
              </div>
              <div className="flex-1 pt-1.5">
                <p className={`text-[13px] font-semibold leading-snug ${i === 0 ? 'text-[#1E1208]' : 'text-[#705A48]'}`}>
                  {ev.status}
                </p>
                {ev.subStatus && ev.subStatus.length > 0 && (
                  <p className="text-[12px] text-[#B09C8C] mt-0.5 leading-relaxed">
                    {ev.subStatus.join(' · ')}
                  </p>
                )}
                {(ev.location || ev.date) && (
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {ev.location && <span className="text-[11px] text-[#B09C8C]">{ev.location}</span>}
                    {ev.location && ev.date && <span className="text-[#E6DFD5]">·</span>}
                    {ev.date && <span className="text-[11px] text-[#B09C8C] tabular-nums">{ev.date}{ev.time ? ` às ${ev.time}` : ''}</span>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {result.source === 'cache' && (
        <p className="text-[10px] text-[#B09C8C] mt-4 text-right">
          Cache · {new Date(result.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  );
}
