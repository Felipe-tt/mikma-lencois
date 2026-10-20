'use client';
import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';

interface Props {
  routePoints?: { lat: number; lng: number }[];
  courierLat?: number;
  courierLng?: number;
  courierLocationAt?: string;
  courierName?: string;
}

type Leaflet = typeof import('leaflet');

// Ícones customizados (círculos simples em SVG inline) em vez dos ícones
// padrão do Leaflet, evita o problema clássico de bundler não encontrar
// os arquivos .png dos marcadores padrão, e já sai no estilo da marca.
function makeDivIcon(L: Leaflet, color: string, pulse = false) {
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
  const [map, setMap] = useState<{ L: Leaflet; map: import('leaflet').Map } | null>(null);
  const routeLayerRef = useRef<import('leaflet').LayerGroup | null>(null);
  const courierMarkerRef = useRef<import('leaflet').Marker | null>(null);
  const fittedRef = useRef<string>('');

  const hasCourier = typeof courierLat === 'number' && typeof courierLng === 'number';
  const hasRoute = !!routePoints && routePoints.length > 1;
  const visible = hasRoute || hasCourier;
  const routeKey = hasRoute ? routePoints!.map(p => `${p.lat},${p.lng}`).join(';') : '';

  // Monta o mapa quando há algo pra mostrar. Antes montava só uma vez, na
  // primeira renderização: se a página abria sem rota nem entregador, o
  // mapa nunca aparecia, mesmo depois dos dados chegarem.
  useEffect(() => {
    if (!visible || !containerRef.current) return;
    let cancelled = false;
    let created: import('leaflet').Map | null = null;

    import('leaflet').then((L) => {
      if (cancelled || !containerRef.current) return;
      created = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: false,
      });
      // OpenStreetMap, tiles gratuitos, sem chave de API.
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(created);
      setMap({ L, map: created });
    });

    return () => {
      cancelled = true;
      created?.remove();
      routeLayerRef.current = null;
      courierMarkerRef.current = null;
      fittedRef.current = '';
      setMap(null);
    };
  }, [visible]);

  // Rota e pinos da loja e do endereço.
  useEffect(() => {
    if (!map) return;
    routeLayerRef.current?.remove();
    routeLayerRef.current = null;
    if (!routeKey) return;
    const { L } = map;
    const latlngs = routePoints!.map(p => [p.lat, p.lng] as [number, number]);
    const layer = L.layerGroup();
    L.polyline(latlngs, { color: '#C4714A', weight: 4, opacity: 0.85 }).addTo(layer);
    L.marker(latlngs[0], { icon: makeDivIcon(L, '#1E1208') }).bindTooltip('Loja').addTo(layer);
    L.marker(latlngs[latlngs.length - 1], { icon: makeDivIcon(L, '#705A48') }).bindTooltip('Endereço de entrega').addTo(layer);
    layer.addTo(map.map);
    routeLayerRef.current = layer;
    // routePoints muda de referência a cada snapshot; routeKey só quando a rota muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, routeKey]);

  // Pino do motoboy: move sem recriar o mapa a cada posição nova.
  useEffect(() => {
    if (!map) return;
    if (!hasCourier) {
      courierMarkerRef.current?.remove();
      courierMarkerRef.current = null;
      return;
    }
    const { L } = map;
    if (courierMarkerRef.current) {
      courierMarkerRef.current.setLatLng([courierLat!, courierLng!]);
    } else {
      courierMarkerRef.current = L.marker([courierLat!, courierLng!], { icon: makeDivIcon(L, '#C4714A', true), zIndexOffset: 1000 })
        .addTo(map.map);
    }
    courierMarkerRef.current.unbindTooltip().bindTooltip(courierName ? `${courierName} (agora)` : 'Entregador');
  }, [map, hasCourier, courierLat, courierLng, courierName]);

  // Enquadra de novo só quando muda o que aparece (rota nova, entregador
  // apareceu), não a cada posição: o cliente pode ter dado zoom.
  useEffect(() => {
    if (!map) return;
    const key = `${routeKey}|${hasCourier}`;
    if (fittedRef.current === key) return;
    fittedRef.current = key;
    const bounds: [number, number][] = hasRoute ? routePoints!.map(p => [p.lat, p.lng] as [number, number]) : [];
    if (hasCourier) bounds.push([courierLat!, courierLng!]);
    if (bounds.length > 1) map.map.fitBounds(bounds, { padding: [32, 32] });
    else if (bounds.length === 1) map.map.setView(bounds[0], 15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, routeKey, hasCourier]);

  if (!visible) {
    return (
      <div className="h-56 flex items-center justify-center rounded-2xl bg-paper border border-mist px-6 text-center text-[12px] text-faint">
        Carregando o mapa da entrega…
      </div>
    );
  }

  const isStale = hasCourier && courierLocationAt && (Date.now() - new Date(courierLocationAt).getTime()) > 5 * 60 * 1000;

  return (
    <div className="flex flex-col gap-1.5">
      <div ref={containerRef} className="h-56 w-full rounded-2xl overflow-hidden border border-mist isolate" />
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
