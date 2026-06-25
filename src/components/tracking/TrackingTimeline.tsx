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

function statusIcon(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('entregue') || s.includes('entrega efetuada')) return '✓';
  if (s.includes('saiu para entrega') || s.includes('em rota')) return '🚚';
  if (s.includes('postado') || s.includes('coletado')) return '📦';
  if (s.includes('triagem') || s.includes('encaminhado') || s.includes('transferência')) return '🔄';
  if (s.includes('chegou') || s.includes('recebido')) return '📍';
  if (s.includes('aguardando') || s.includes('etiqueta')) return '⏳';
  if (s.includes('tentativa') || s.includes('não entregue') || s.includes('ausente')) return '⚠️';
  if (s.includes('devolvido') || s.includes('devolução') || s.includes('cancelado')) return '↩️';
  return '•';
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
            Rastrear{carrierName ? ` na ${carrierName}` : ''} →
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
              className="text-[11px] font-semibold text-[#705A48] hover:text-[#1E1208] transition-colors"
            >
              Ver no site →
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
                <span className={`text-[13px] ${i === 0 ? 'text-white' : 'text-[#B09C8C]'}`}>
                  {statusIcon(ev.status)}
                </span>
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
