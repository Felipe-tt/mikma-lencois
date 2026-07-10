'use client';
import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

interface Props {
  routePoints?: { lat: number; lng: number }[];
  courierLat?: number;
  courierLng?: number;
  courierLocationAt?: string;
  courierName?: string;
}

// Ícones customizados (círculos simples em SVG inline) em vez dos ícones
// padrão do Leaflet — evita o problema clássico de bundler não encontrar
// os arquivos .png dos marcadores padrão, e já sai no estilo da marca.
function makeDivIcon(L: typeof import('leaflet'), color: string, pulse = false) {
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:16px;height:16px;">
      ${pulse ? `<div style="position:absolute;inset:-8px;border-radius:9999px;background:${color};opacity:0.25;animation:mikma-pulse 1.8s ease-out infinite;"></div>` : ''}
      <div style="width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>
    </div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

export function LiveDeliveryMap({ routePoints, courierLat, courierLng, courierLocationAt, courierName }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const courierMarkerRef = useRef<import('leaflet').Marker | null>(null);

  const hasCourier = typeof courierLat === 'number' && typeof courierLng === 'number';
  const hasRoute = !!routePoints && routePoints.length > 1;

  // Monta o mapa uma vez
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    import('leaflet').then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: false,
      });
      mapRef.current = map;

      // OpenStreetMap — tiles gratuitos, sem chave de API.
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);

      const bounds: [number, number][] = [];

      if (hasRoute) {
        const latlngs = routePoints!.map(p => [p.lat, p.lng] as [number, number]);
        L.polyline(latlngs, { color: '#C4714A', weight: 4, opacity: 0.85 }).addTo(map);

        const origin = routePoints![0];
        const dest = routePoints![routePoints!.length - 1];
        L.marker([origin.lat, origin.lng], { icon: makeDivIcon(L, '#1E1208') }).addTo(map).bindTooltip('Loja');
        L.marker([dest.lat, dest.lng], { icon: makeDivIcon(L, '#705A48') }).addTo(map).bindTooltip('Endereço de entrega');
        bounds.push(...latlngs);
      }

      if (hasCourier) {
        const marker = L.marker([courierLat!, courierLng!], { icon: makeDivIcon(L, '#C4714A', true) })
          .addTo(map)
          .bindTooltip(courierName ? `${courierName} (agora)` : 'Entregador');
        courierMarkerRef.current = marker;
        bounds.push([courierLat!, courierLng!]);
      }

      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [32, 32] });
      } else if (bounds.length === 1) {
        map.setView(bounds[0], 15);
      } else {
        map.setView([-27.0, -49.0], 12); // fallback: região aproximada, só pra não quebrar
      }
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      courierMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Move o pino do motoboy sem recriar o mapa inteiro a cada atualização
  useEffect(() => {
    if (!hasCourier || !courierMarkerRef.current) return;
    courierMarkerRef.current.setLatLng([courierLat!, courierLng!]);
  }, [courierLat, courierLng, hasCourier]);

  if (!hasRoute && !hasCourier) {
    return (
      <div className="h-56 flex items-center justify-center bg-paper border border-mist text-[12px] text-faint">
        Mapa aparece assim que o motoboy for atribuído.
      </div>
    );
  }

  const isStale = courierLocationAt && (Date.now() - new Date(courierLocationAt).getTime()) > 5 * 60 * 1000;

  return (
    <div className="flex flex-col gap-1.5">
      <div ref={containerRef} className="h-56 w-full border border-mist" />
      {isStale && (
        <p className="text-[11px] text-faint">Última posição recebida há um tempo. Pode estar desatualizada.</p>
      )}
      <style jsx global>{`
        @keyframes mikma-pulse {
          0% { transform: scale(0.6); opacity: 0.35; }
          100% { transform: scale(1.8); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
