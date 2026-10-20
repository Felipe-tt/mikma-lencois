'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Order } from '@/types';
import { courierVehicleLabel } from '@/lib/carriers';
import type { DeliveryPhase } from './LiveDeliveryMap';

const LiveDeliveryMap = dynamic(() => import('./LiveDeliveryMap').then(m => m.LiveDeliveryMap), {
  ssr: false,
  loading: () => <div className="h-72 sm:h-80 rounded-2xl border border-mist bg-[#EEF0F2] animate-pulse" />,
});

type Delivery = Order['delivery'];

/** Fase da corrida a partir do último status da Uber. */
export function uberPhase(d: Delivery): DeliveryPhase {
  const s = d.uberLastStatus;
  if (s === 'pickup_complete' || s === 'dropoff') return 'to_customer';
  if (s === 'pickup' || d.courierName) return 'to_store';
  return 'searching';
}

const STEPS = ['Entregador', 'Coleta', 'A caminho', 'Entregue'];

function useNow(ms: number) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, ms);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [ms]);
  return now;
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/**
 * Acompanhamento da corrida da Uber Direct no estilo do app da Uber: status
 * com horário de chegada, barra de etapas, mapa ao vivo e o entregador com
 * carro e placa. Usado na página do pedido (cliente) e no painel.
 */
export function UberTracking({ delivery, audience }: { delivery: Delivery; audience: 'cliente' | 'loja' }) {
  const now = useNow(30_000);
  const phase = uberPhase(delivery);
  const name = delivery.courierName?.split(' ')[0];
  const etaIso = phase === 'to_store' ? delivery.pickupEta : delivery.dropoffEta;
  const etaValid = !!etaIso && !Number.isNaN(Date.parse(etaIso));
  const minutes = etaValid && now !== null ? Math.max(0, Math.round((Date.parse(etaIso!) - now) / 60_000)) : null;

  const step = phase === 'searching' ? 0 : phase === 'to_store' ? 1 : 2;

  let title: string;
  let subtitle: string;
  if (phase === 'searching') {
    title = 'Procurando entregador';
    subtitle = 'A Uber está chamando alguém perto da loja. Costuma levar poucos minutos.';
  } else if (phase === 'to_store') {
    title = audience === 'loja'
      ? (etaValid ? `Chega na loja às ${hhmm(etaIso!)}` : 'Entregador a caminho da loja')
      : (delivery.dropoffEta ? `Chega por volta de ${hhmm(delivery.dropoffEta)}` : 'Entregador a caminho da loja');
    subtitle = audience === 'loja'
      ? `${name ?? 'O entregador'} está indo buscar o pacote. Deixe separado.`
      : `${name ?? 'O entregador'} está indo buscar seu pedido na loja.`;
  } else {
    title = etaValid ? `Chega às ${hhmm(etaIso!)}` : 'A caminho';
    subtitle = minutes !== null && minutes <= 1
      ? `${name ?? 'O entregador'} está chegando.`
      : `${name ?? 'O entregador'} está a caminho${audience === 'loja' ? ' do cliente' : ' de você'}${minutes !== null ? `, cerca de ${minutes} min` : ''}.`;
  }

  const store = delivery.pickupPoint ?? null;
  const home = delivery.dropoffPoint ?? null;
  const hasCourierPos = typeof delivery.courierLat === 'number' && typeof delivery.courierLng === 'number';
  const stale = hasCourierPos && delivery.courierLocationAt && now !== null && now - Date.parse(delivery.courierLocationAt) > 5 * 60_000;
  const car = [delivery.courierCar, delivery.courierCarColor].filter(Boolean).join(' · ')
    || (delivery.courierVehicle ? courierVehicleLabel(delivery.courierVehicle) : '');

  return (
    <div className="overflow-hidden rounded-2xl border border-mist bg-paper">
      <div className="px-5 pt-5 pb-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">Entrega Uber</p>
        <h3 className="mt-1.5 text-[22px] leading-tight font-bold tracking-tight text-ink" aria-live="polite">{title}</h3>
        <p className="mt-1 text-[13px] text-mid text-pretty">{subtitle}</p>

        <ol className="mt-4 grid grid-cols-4 gap-1.5" aria-label="Etapas da entrega">
          {STEPS.map((label, i) => (
            <li key={label} className="flex flex-col gap-1.5">
              <span className={`relative h-1 overflow-hidden rounded-full ${i < step ? 'bg-ink' : 'bg-mist'}`}>
                {i === step && <span className="sd-progress absolute inset-y-0 left-0 w-full bg-ink" />}
              </span>
              <span className={`text-[10.5px] ${i <= step ? 'text-ink font-semibold' : 'text-faint'}`} aria-current={i === step ? 'step' : undefined}>{label}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="px-3">
        <LiveDeliveryMap
          routePoints={delivery.routePoints}
          store={store}
          home={home}
          courier={hasCourierPos ? { lat: delivery.courierLat!, lng: delivery.courierLng!, vehicle: delivery.courierVehicle } : null}
          phase={phase}
          etaMinutes={phase === 'to_customer' ? minutes : null}
        />
        {stale && (
          <p className="mt-1.5 px-1 text-[11px] text-faint">A Uber não manda a posição há alguns minutos. Ela pode estar desatualizada.</p>
        )}
      </div>

      {delivery.courierName ? (
        <div className="px-5 py-4">
          <div className="flex items-center gap-3">
            {delivery.courierPhoto ? (
              <img src={delivery.courierPhoto} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover bg-mist" />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-mist">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-6 w-6 text-mid"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold leading-snug text-ink break-words">{delivery.courierName}</p>
              {typeof delivery.courierRating === 'number' && (
                <p className="text-[12px] text-mid">★ {delivery.courierRating.toFixed(1).replace('.', ',')}</p>
              )}
            </div>
            {(delivery.courierPlate || car) && (
              <div className="flex shrink-0 flex-col items-end gap-1 text-right max-w-[45%]">
                {delivery.courierPlate && (
                  <span className="rounded-md border border-ink/70 bg-white px-2 py-0.5 font-mono text-[13px] font-bold tracking-wider text-[#111]">
                    {delivery.courierPlate}
                  </span>
                )}
                {car && <span className="text-[12px] leading-tight text-mid">{car}</span>}
              </div>
            )}
          </div>
          {delivery.courierPhone && (
            <a
              href={`tel:${delivery.courierPhone.replace(/[^\d+]/g, '')}`}
              className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-full bg-warm py-2.5 text-[13px] font-semibold text-ink hover:bg-mist transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>
              Ligar para {name}
            </a>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3 px-5 py-4">
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ink/40 motion-reduce:animate-none" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-ink" />
          </span>
          <p className="text-[13px] text-mid">Assim que alguém aceitar, o nome, o carro e a placa aparecem aqui.</p>
        </div>
      )}

      {delivery.trackingUrl && (
        <a
          href={delivery.trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 border-t border-mist px-5 py-3 text-[12.5px] font-semibold text-ink hover:bg-warm transition-colors"
        >
          Abrir no site da Uber
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M7 17L17 7M8 7h9v9"/></svg>
        </a>
      )}
      <style jsx>{`
        .sd-progress { transform-origin: left; animation: sd-fill 1.6s ease-in-out infinite; }
        @keyframes sd-fill { 0% { transform: scaleX(0); opacity: 1; } 70% { transform: scaleX(1); opacity: 1; } 100% { transform: scaleX(1); opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { .sd-progress { animation: none; transform: scaleX(.5); } }
      `}</style>
    </div>
  );
}
