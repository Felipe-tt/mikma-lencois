'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Order } from '@/types';
import { courierCarColor, courierVehicleLabel } from '@/lib/carriers';
import { maskPhone } from '@/lib/masks';
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

// Barra de 5 partes como a da Uber: procurando, indo à loja, coletado,
// a caminho, entregue. A parte atual fica pulsando.
function progressStep(d: Delivery): number {
  switch (d.uberLastStatus) {
    case 'pickup': return 1;
    case 'pickup_complete': return 2;
    case 'dropoff': return 3;
    case 'delivered': return 5;
    default: return d.courierName ? 1 : 0;
  }
}

const UBER_GREEN = '#06C167';

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

// "+5547999990000" → "(47) 99999-0000"; número de fora do Brasil fica como veio.
function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  const local = d.startsWith('55') && (d.length === 12 || d.length === 13) ? d.slice(2) : d.length <= 11 ? d : '';
  return local ? maskPhone(local) : raw;
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** Carro de lado, pintado com a cor que a Uber informa; pacote no teto depois da coleta. */
function CarArt({ color, loaded }: { color: string; loaded: boolean }) {
  return (
    <svg viewBox="0 0 120 52" className="h-auto w-full" aria-hidden="true">
      <ellipse cx="60" cy="46" rx="52" ry="3.5" fill="#000" opacity=".12" />
      <path d="M7 35c0-5 3-7.5 9-8.5l17-2.6C39 16 47 12 59 12h16c10 0 18 4.6 24 11.3l8 1.6c5 1 7 3.8 7 8.1v4c0 2-1.6 3.4-3.5 3.4H10.5C8.6 40.4 7 39 7 37z"
        fill={color} stroke="#000" strokeOpacity=".22" strokeWidth="1" />
      <path d="M38 23.8C43 17.4 49 15 58 15h3.5v8.8z" fill="#24303C" />
      <path d="M65.5 15H75c8 0 14 3 19 8.8H65.5z" fill="#24303C" />
      <path d="M12 31h9" stroke="#000" strokeOpacity=".25" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="106" y="29" width="6" height="2.6" rx="1.3" fill="#F6E7A1" />
      <circle cx="31" cy="40" r="7.5" fill="#1C1C1C" /><circle cx="31" cy="40" r="3.2" fill="#9AA0A6" />
      <circle cx="92" cy="40" r="7.5" fill="#1C1C1C" /><circle cx="92" cy="40" r="3.2" fill="#9AA0A6" />
      {loaded && (
        <>
          <rect x="49" y="2" width="24" height="10" rx="2" fill={UBER_GREEN} />
          <path d="M61 3v8M50 7h22" stroke="#fff" strokeOpacity=".75" strokeWidth="1.4" />
        </>
      )}
    </svg>
  );
}

/** Moto de lado, com o baú no bagageiro (verde, com o pacote, depois da coleta). */
function MotoArt({ color, loaded }: { color: string; loaded: boolean }) {
  return (
    <svg viewBox="0 0 120 52" className="h-auto w-full" aria-hidden="true">
      <ellipse cx="60" cy="47.5" rx="48" ry="2.6" fill="#000" opacity=".12" />
      {/* bagageiro preso no quadro, com o baú em cima */}
      <path d="M15 27h28" stroke="#3A3F45" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M26 27l7 8" stroke="#3A3F45" strokeWidth="2.2" strokeLinecap="round" />
      <rect x="15" y={loaded ? 9 : 12} width="24" height={loaded ? 17 : 14} rx="2.5"
        fill={loaded ? UBER_GREEN : '#2B2F35'} stroke={loaded ? '#04883F' : '#16191C'} strokeWidth="1" />
      {loaded
        ? <path d="M27 10v15M16 17.5h22" stroke="#fff" strokeOpacity=".8" strokeWidth="1.5" />
        : <path d="M17 16h20" stroke="#fff" strokeOpacity=".15" strokeWidth="1.5" />}
      <circle cx="27" cy="38" r="9" fill="#1C1C1C" /><circle cx="27" cy="38" r="3.4" fill="#9AA0A6" />
      <circle cx="93" cy="38" r="9" fill="#1C1C1C" /><circle cx="93" cy="38" r="3.4" fill="#9AA0A6" />
      <path d="M27 38L48 34" stroke="#3A3F45" strokeWidth="3" strokeLinecap="round" />
      <rect x="46" y="29" width="16" height="10" rx="3" fill="#3A3F45" />
      <path d="M40 27c2-4 6-6 11-6h16c5 0 9 2 12 6l3 4H48c-4 0-7-1-8-4z" fill={color} stroke="#000" strokeOpacity=".45" strokeWidth="1.2" />
      <path d="M38 22.5c3-2.5 7-3.5 12-3.5h10" stroke="#1C1C1C" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M93 38L85 16" stroke="#3A3F45" strokeWidth="3" strokeLinecap="round" />
      <path d="M84 30c4-2 10-2 15 1" stroke={color} strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M80 14h10" stroke="#1C1C1C" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="90" cy="21" r="2.2" fill="#F6E7A1" />
    </svg>
  );
}

interface Props {
  delivery: Delivery;
  audience: 'cliente' | 'loja';
  /** Etiqueta do pino de entrega (rua e número). */
  addressLabel?: string;
}

/**
 * Acompanhamento da corrida da Uber Direct no estilo do app da Uber: título
 * da etapa com horário de chegada, barra de progresso, mapa ao vivo e o
 * entregador com carro, cor e placa. Usado na página do pedido e no painel.
 */
export function UberTracking({ delivery, audience, addressLabel }: Props) {
  const now = useNow(30_000);
  const phase = uberPhase(delivery);
  const step = progressStep(delivery);
  const name = delivery.courierName?.split(' ')[0];
  const etaIso = audience === 'loja' && phase === 'to_store' ? delivery.pickupEta : delivery.dropoffEta;
  const etaValid = !!etaIso && !Number.isNaN(Date.parse(etaIso));
  const minutes = etaValid && now !== null ? Math.max(0, Math.round((Date.parse(etaIso!) - now) / 60_000)) : null;

  let title: string;
  if (phase === 'searching') title = 'Procurando entregador…';
  else if (phase === 'to_store') title = audience === 'loja' ? 'Entregador a caminho da loja' : 'Retirando seu pedido…';
  else if (minutes !== null && minutes <= 2) title = 'Chegando…';
  else title = audience === 'loja' ? 'A caminho do cliente' : 'A caminho';
  const etaLine = etaValid
    ? `${audience === 'loja' && phase === 'to_store' ? 'Chegada na loja' : 'Chegada'}: ${hhmm(etaIso!)}${minutes !== null && phase === 'to_customer' && minutes > 2 ? ` · ${minutes} min` : ''}`
    : phase === 'searching' ? 'Costuma levar poucos minutos' : null;

  const hasCourierPos = typeof delivery.courierLat === 'number' && typeof delivery.courierLng === 'number';
  const stale = hasCourierPos && delivery.courierLocationAt && now !== null && now - Date.parse(delivery.courierLocationAt) > 5 * 60_000;
  const color = courierCarColor(delivery.courierCarColor);
  const vehicle = (delivery.courierVehicle ?? 'car').toLowerCase();
  const isMoto = ['motorcycle', 'scooter', 'moto'].includes(vehicle);
  const isCar = !isMoto && !['bicycle', 'walker'].includes(vehicle);
  // A moto: concorda a cor no feminino ("Vermelha", "Branca").
  const colorLabel = color && isMoto && /o$/.test(color.label) && color.label !== 'Vinho' ? color.label.replace(/o$/, 'a') : color?.label;
  const carName = [delivery.courierCar, colorLabel].filter(Boolean).join(' ');

  return (
    <div className="overflow-hidden rounded-2xl border border-mist bg-paper">
      <div className="px-5 pt-5 pb-4">
        <h3 className="text-[21px] leading-tight font-bold tracking-tight text-ink" aria-live="polite">{title}</h3>
        {etaLine && <p className="mt-1 text-[13px] text-mid tabular-nums">{etaLine}</p>}
        <div className="mt-3.5 grid grid-cols-5 gap-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={5} aria-valuenow={step} aria-label="Andamento da entrega">
          {[0, 1, 2, 3, 4].map(i => (
            <span key={i} className="relative h-1 overflow-hidden rounded-full bg-mist">
              {i < step && <span className="absolute inset-0" style={{ background: UBER_GREEN }} />}
              {i === step && <span className="sd-progress absolute inset-0" style={{ background: UBER_GREEN }} />}
            </span>
          ))}
        </div>
      </div>

      <div className="px-3">
        <LiveDeliveryMap
          routePoints={delivery.routePoints}
          store={delivery.pickupPoint ?? null}
          home={delivery.dropoffPoint ?? null}
          courier={hasCourierPos ? { lat: delivery.courierLat!, lng: delivery.courierLng!, vehicle: delivery.courierVehicle } : null}
          phase={phase}
          etaMinutes={phase === 'to_customer' ? minutes : null}
          storeLabel="Mikma Lençóis"
          homeLabel={addressLabel ?? (audience === 'loja' ? 'Cliente' : 'Você')}
        />
        {stale && (
          <p className="mt-1.5 px-1 text-[11px] text-faint">A Uber não manda a posição há alguns minutos. Ela pode estar desatualizada.</p>
        )}
      </div>

      {delivery.courierName ? (
        <div className="flex items-center gap-4 px-5 py-4">
          <div className="relative w-[104px] shrink-0">
            {isCar ? (
              <CarArt color={color?.hex ?? '#C3C7CC'} loaded={phase === 'to_customer'} />
            ) : isMoto ? (
              <MotoArt color={color?.hex ?? '#C0392B'} loaded={phase === 'to_customer'} />
            ) : (
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-mist text-[11px] font-semibold text-mid">
                {courierVehicleLabel(delivery.courierVehicle!)}
              </span>
            )}
            {delivery.courierPhoto && (
              <img src={delivery.courierPhoto} alt="" className="absolute -bottom-1 -right-1 h-9 w-9 rounded-full border-2 border-paper object-cover bg-mist" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-[14px] font-semibold" style={{ color: UBER_GREEN }}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4 shrink-0"><circle cx="12" cy="7" r="3.5"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/></svg>
              <span className="truncate">{name}</span>
              {typeof delivery.courierRating === 'number' && (
                <span className="ml-1 text-[12px] font-medium text-mid">★ {delivery.courierRating.toFixed(1).replace('.', ',')}</span>
              )}
            </p>
            <p className="mt-0.5 text-[14px] font-semibold leading-snug text-ink">
              {carName || (delivery.courierVehicle ? courierVehicleLabel(delivery.courierVehicle) : 'Entregador Uber')}
            </p>
            {delivery.courierPlate && (
              <p className="mt-1 inline-block rounded border border-ink/60 px-1.5 font-mono text-[12px] font-bold tracking-wider text-ink">{delivery.courierPlate}</p>
            )}
            {delivery.courierPhone && <p className="mt-0.5 text-[12px] text-mid tabular-nums">{formatPhone(delivery.courierPhone)}</p>}
          </div>
          {delivery.courierPhone && (
            <a
              href={`tel:${delivery.courierPhone.replace(/[^\d+]/g, '')}`}
              aria-label={`Ligar para ${name ?? 'o entregador'}`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-warm text-ink hover:bg-mist transition-colors"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-[18px] w-[18px]"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>
            </a>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3 px-5 py-4">
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50 motion-reduce:animate-none" style={{ background: UBER_GREEN }} />
            <span className="relative inline-flex h-3 w-3 rounded-full" style={{ background: UBER_GREEN }} />
          </span>
          <p className="text-[13px] text-mid">Assim que alguém aceitar, o entregador e o carro aparecem aqui.</p>
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
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M7 17L17 7M8 7h9v9"/></svg>
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
