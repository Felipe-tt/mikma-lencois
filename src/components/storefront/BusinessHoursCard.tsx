'use client';

import { useEffect, useState } from 'react';
import { parseBusinessHours, getOpenStatus, groupConsecutiveDays } from '@/lib/business-hours';

interface Props {
  businessHours: string;
  timezone?: string;
}

/**
 * Versão client-side do card de horário de funcionamento.
 * A página Sobre usa ISR (revalidate: 86400) então o status "aberto agora"
 * calculado no servidor ficaria desatualizado por até 24h. Este componente
 * recalcula no navegador a cada minuto para sempre refletir o horário real.
 */
export function BusinessHoursCard({ businessHours, timezone = 'America/Sao_Paulo' }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const hours = parseBusinessHours(businessHours);
  const status = getOpenStatus(hours, timezone);
  const groups = groupConsecutiveDays(hours);

  return (
    <div className="border border-mist px-6 py-5" data-now={now}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[9px] font-bold tracking-[0.22em] uppercase text-faint">Horário de funcionamento</p>
        <span className={`flex items-center gap-1.5 text-[10px] font-bold tracking-wide uppercase px-2 py-1 shrink-0 ${
          status.isOpen ? 'bg-green-100 text-green-700' : 'bg-warm text-faint'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${status.isOpen ? 'bg-green-500' : 'bg-faint'}`} />
          {status.isOpen ? 'Aberto' : 'Fechado'}
        </span>
      </div>
      <p className="text-[12px] text-mid mb-3">{status.nextChangeLabel}</p>
      <dl className="flex flex-col gap-1.5">
        {groups.map(g => (
          <div key={g.label} className="flex items-baseline justify-between gap-3 text-[13px]">
            <dt className="text-faint shrink-0">{g.label}</dt>
            <dd className={`text-right tabular-nums ${g.text === 'Fechado' ? 'text-faint-l' : 'text-ink'}`}>{g.text}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
