'use client';
import { useEffect, useRef, useState } from 'react';
import type { Map as MlMap, Marker as MlMarker, StyleSpecification, GeoJSONSource } from 'maplibre-gl';
type Ml = typeof import('maplibre-gl');
import 'maplibre-gl/dist/maplibre-gl.css';

export type Pt = { lat: number; lng: number };
export type DeliveryPhase = 'searching' | 'to_store' | 'to_customer';

interface Props {
  routePoints?: Pt[] | null;
  store?: Pt | null;
  home?: Pt | null;
  courier?: (Pt & { vehicle?: string }) | null;
  phase: DeliveryPhase;
  /** Minutos até a chegada no endereço, mostrado no pino da casa. */
  etaMinutes?: number | null;
  /** Etiquetas dos pinos, como no app da Uber ("Mikma Lençóis", "Rua X, 105"). */
  storeLabel?: string;
  homeLabel?: string;
}

// Mapa vetorial claro, no estilo do app da Uber. OpenFreeMap: gratuito, sem
// chave e sem limite de uso. Se não carregar, cai pros tiles do OSM.
const VECTOR_STYLE = 'https://tiles.openfreemap.org/styles/positron';
const RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap' } },
  layers: [{ id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-saturation': -0.85, 'raster-brightness-min': 0.15 } }],
};

const INK = '#111111';
// Leva quase o intervalo entre posições (10s): o carro anda sem parar, como na Uber.
const ANIM_MS = 9000;

function el(html: string, className = ''): HTMLDivElement {
  const d = document.createElement('div');
  d.className = className;
  d.innerHTML = html;
  return d;
}

// Pino no estilo da Uber: ponto preto com etiqueta preta ao lado.
function pinHtml(kind: 'store' | 'home', label: string): string {
  const esc = label.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  return `<span class="sd-dot sd-dot-${kind}"></span><span class="sd-tag"><span class="sd-eta" hidden></span><span class="sd-tag-text">${esc}</span></span>`;
}

// Ícones vistos de cima, frente pra cima (rumo 0 = norte), como no app da
// Uber. Depois da coleta aparece o pacote verde em cima, como na Uber.
const BOX = '#06C167';
function boxSvg(x: number, y: number, w: number, h: number): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.6" fill="${BOX}" stroke="#04883F" stroke-width="1"/>`
    + `<path d="M${x + w / 2} ${y + 1}V${y + h - 1}M${x + 1} ${y + h / 2}H${x + w - 1}" stroke="#fff" stroke-opacity=".75" stroke-width="1.2"/>`;
}

const CAR_ICON = (loaded: boolean) => `<svg viewBox="0 0 24 44" width="21" height="38" aria-hidden="true">
  <rect x="2" y="2" width="20" height="40" rx="7" fill="#fff" stroke="${INK}" stroke-width="1.6"/>
  <rect x="5" y="9" width="14" height="6.5" rx="2.5" fill="${INK}"/>
  <rect x="5.5" y="31" width="13" height="4.5" rx="2" fill="${INK}" opacity=".8"/>
  ${loaded ? boxSvg(5.5, 16.5, 13, 12.5) : ''}
</svg>`;

// Moto: roda da frente, guidão, banco e roda de trás; o baú vai na traseira.
const MOTO_ICON = (loaded: boolean) => `<svg viewBox="0 0 24 44" width="19" height="35" aria-hidden="true">
  <rect x="9.5" y="2" width="5" height="9" rx="2.5" fill="${INK}"/>
  <path d="M4 12.5h16" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
  <rect x="7.5" y="11" width="9" height="19" rx="4.5" fill="#fff" stroke="${INK}" stroke-width="1.6"/>
  <rect x="9.5" y="16" width="5" height="9" rx="2.5" fill="${INK}" opacity=".85"/>
  <rect x="9.5" y="31" width="5" height="10" rx="2.5" fill="${INK}"/>
  ${loaded ? boxSvg(5, 27, 14, 13) : ''}
</svg>`;

// Bicicleta: mais fina, com a mochila de entrega nas costas do entregador.
const BIKE_ICON = (loaded: boolean) => `<svg viewBox="0 0 24 44" width="18" height="33" aria-hidden="true">
  <rect x="10.5" y="2" width="3" height="11" rx="1.5" fill="${INK}"/>
  <path d="M5 13h14" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
  <path d="M12 13v17" stroke="${INK}" stroke-width="2"/>
  <circle cx="12" cy="21" r="4.5" fill="#fff" stroke="${INK}" stroke-width="1.6"/>
  <rect x="10.5" y="30" width="3" height="12" rx="1.5" fill="${INK}"/>
  ${loaded ? boxSvg(5.5, 19, 13, 11) : ''}
</svg>`;

function courierIcon(vehicle: string | undefined, loaded: boolean): string {
  const v = (vehicle ?? 'car').toLowerCase();
  if (v === 'motorcycle' || v === 'scooter' || v === 'moto') return MOTO_ICON(loaded);
  if (v === 'bicycle' || v === 'walker') return BIKE_ICON(loaded);
  return CAR_ICON(loaded);
}

function bearing(a: Pt, b: Pt): number {
  const r = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

function metersBetween(a: Pt, b: Pt): number {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}

/** Índice do ponto da rota mais perto do entregador (pra separar o já andado). */
function nearestIndex(route: Pt[], p: Pt): number {
  let best = 0, bestD = Infinity;
  route.forEach((q, i) => {
    const d = (q.lat - p.lat) ** 2 + (q.lng - p.lng) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

const line = (pts: Pt[]) => ({
  type: 'Feature' as const, properties: {},
  geometry: { type: 'LineString' as const, coordinates: pts.map(p => [p.lng, p.lat]) },
});

export function LiveDeliveryMap({ routePoints, store, home, courier, phase, etaMinutes, storeLabel = 'Loja', homeLabel = 'Entrega' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const mlRef = useRef<Ml | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [followed, setFollowed] = useState(true);
  const markers = useRef<{ store?: MlMarker; home?: MlMarker; courier?: MlMarker; eta?: HTMLElement }>({});
  const shown = useRef<{ pos: Pt; bearing: number } | null>(null);
  const anim = useRef<number>(0);

  const route = routePoints && routePoints.length > 1 ? routePoints : null;
  const storePt = store ?? route?.[0] ?? null;
  const homePt = home ?? route?.[route.length - 1] ?? null;
  const routeKey = route ? `${route.length}:${route[0].lat},${route[0].lng}:${route[route.length - 1].lat}` : '';

  // Monta o mapa uma vez.
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let map: MlMap | null = null;
    import('maplibre-gl').then((mod) => {
      // Bundle UMD: conforme o empacotador, as classes vêm no módulo ou em default.
      const ml = ((mod as { default?: Ml }).default?.Map ? (mod as { default: Ml }).default : mod) as Ml;
      if (cancelled || !containerRef.current) return;
      try {
        map = new ml.Map({
          container: containerRef.current,
          style: VECTOR_STYLE,
          center: [-49.07, -26.92],
          zoom: 12,
          attributionControl: { compact: true },
          cooperativeGestures: true,
          pitchWithRotate: false,
          dragRotate: false,
          locale: {
            'CooperativeGesturesHandler.WindowsHelpText': 'Use Ctrl + rolagem para dar zoom no mapa',
            'CooperativeGesturesHandler.MacHelpText': 'Use ⌘ + rolagem para dar zoom no mapa',
            'CooperativeGesturesHandler.MobileHelpText': 'Use dois dedos para mover o mapa',
          },
        });
      } catch {
        setFailed(true); // sem WebGL
        return;
      }
      mapRef.current = map;
      mlRef.current = ml;
      let styled = false;
      map.on('error', () => {
        if (!styled && map) { styled = true; map.setStyle(RASTER_STYLE); }
      });
      map.on('load', () => { styled = true; });
      map.on('style.load', () => {
        const m = map!;
        if (!m.getSource('route')) {
          m.addSource('route', { type: 'geojson', data: line([]) });
          m.addSource('done', { type: 'geojson', data: line([]) });
          m.addSource('approach', { type: 'geojson', data: line([]) });
          m.addLayer({ id: 'done', type: 'line', source: 'done', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#9CA3AF', 'line-width': 4 } });
          m.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': 8 } });
          m.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': INK, 'line-width': 4.5 } });
          m.addLayer({ id: 'approach', type: 'line', source: 'approach', layout: { 'line-cap': 'round' }, paint: { 'line-color': INK, 'line-width': 3, 'line-dasharray': [0.5, 2] } });
        }
        setReady(true);
      });
      // Mexeu no mapa: para de enquadrar sozinho e mostra "Centralizar".
      map.on('dragstart', () => setFollowed(false));
      map.on('zoomstart', e => { if ((e as { originalEvent?: unknown }).originalEvent) setFollowed(false); });
    }).catch(() => setFailed(true));

    return () => {
      cancelled = true;
      cancelAnimationFrame(anim.current);
      map?.remove();
      mapRef.current = null;
      markers.current = {};
      shown.current = null;
      setReady(false);
    };
  }, []);

  // Pinos da loja e da casa.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const ml = mlRef.current!;
    {
      const m = markers.current;
      // A etiqueta vai pro lado de fora: o pino mais a leste tem a etiqueta à
      // esquerda, senão ela sai do mapa quando o enquadramento é justo.
      const storeEast = !!(storePt && homePt && storePt.lng > homePt.lng);
      const pin = (kind: 'store' | 'home', label: string, left: boolean) => {
        const node = el(pinHtml(kind, label), left ? 'sd-pin sd-pin-left' : 'sd-pin');
        return new ml.Marker({ element: node, anchor: left ? 'right' : 'left', offset: [left ? 7 : -7, 0] });
      };
      if (storePt) {
        m.store ??= pin('store', storeLabel, storeEast).setLngLat(storePt).addTo(map);
        m.store!.setLngLat(storePt);
      }
      if (homePt) {
        if (!m.home) {
          m.home = pin('home', homeLabel, !storeEast && !!storePt).setLngLat(homePt).addTo(map);
          m.eta = m.home.getElement().querySelector('.sd-eta') as HTMLElement;
        }
        m.home!.setLngLat(homePt);
      }
    }
  }, [ready, storePt?.lat, storePt?.lng, homePt?.lat, homePt?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // ETA no pino da casa ("12 min"), como no app da Uber.
  useEffect(() => {
    const eta = markers.current.eta;
    if (!ready || !eta) return;
    const show = phase === 'to_customer' && typeof etaMinutes === 'number';
    eta.hidden = !show;
    if (show) eta.textContent = etaMinutes! <= 1 ? 'Chegando' : `${etaMinutes} min`;
  }, [ready, phase, etaMinutes, homePt?.lat]);

  // Linhas: rota restante em preto, trecho já andado em cinza e, enquanto o
  // entregador vai até a loja, um tracejado até ela.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const src = (id: string) => map.getSource(id) as GeoJSONSource | undefined;
    let remaining = route ?? [];
    let done: Pt[] = [];
    if (route && courier && phase === 'to_customer') {
      const i = nearestIndex(route, courier);
      done = route.slice(0, i + 1);
      remaining = [courier, ...route.slice(i + 1)];
    }
    src('route')?.setData(line(remaining));
    src('done')?.setData(line(done));
    src('approach')?.setData(line(courier && storePt && phase === 'to_store' ? [courier, storePt] : []));
  }, [ready, routeKey, courier?.lat, courier?.lng, phase, storePt?.lat]); // eslint-disable-line react-hooks/exhaustive-deps

  // Entregador: desliza até a posição nova e gira pro rumo, em vez de pular.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (!courier) {
      markers.current.courier?.remove();
      markers.current.courier = undefined;
      shown.current = null;
      return;
    }
    const target: Pt = { lat: courier.lat, lng: courier.lng };
    const ml = mlRef.current!;
    {
      const m = markers.current;
      if (!m.courier) {
        const node = el(`<div class="sd-halo"></div><div class="sd-vehicle">${courierIcon(courier.vehicle, phase === 'to_customer')}</div>`, 'sd-courier');
        const b = route ? bearing(target, route[Math.min(nearestIndex(route, target) + 1, route.length - 1)]) : 0;
        m.courier = new ml.Marker({ element: node, rotationAlignment: 'map', rotation: b }).setLngLat(target).addTo(map);
        shown.current = { pos: target, bearing: b };
        return;
      }
      const from = shown.current ?? { pos: target, bearing: 0 };
      const moved = metersBetween(from.pos, target) > 3;
      const toBearing = moved ? bearing(from.pos, target) : from.bearing;
      let delta = ((toBearing - from.bearing + 540) % 360) - 180;
      if (!moved) delta = 0;
      cancelAnimationFrame(anim.current);
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / ANIM_MS);
        const e = t; // linear: velocidade constante entre as posições
        const pos = { lat: from.pos.lat + (target.lat - from.pos.lat) * e, lng: from.pos.lng + (target.lng - from.pos.lng) * e };
        const rot = (from.bearing + delta * Math.min(1, t * 6) + 360) % 360;
        m.courier?.setLngLat(pos).setRotation(rot);
        shown.current = { pos, bearing: rot };
        if (t < 1) anim.current = requestAnimationFrame(step);
      };
      anim.current = requestAnimationFrame(step);
    }
  }, [ready, courier?.lat, courier?.lng, courier?.vehicle]); // eslint-disable-line react-hooks/exhaustive-deps

  // Coletou (ou a Uber informou o veículo): troca o desenho, o pacote
  // aparece em cima do carro ou da moto.
  const hasCourierMarker = !!courier;
  useEffect(() => {
    const node = markers.current.courier?.getElement().querySelector('.sd-vehicle');
    if (!ready || !node) return;
    node.innerHTML = courierIcon(courier?.vehicle, phase === 'to_customer');
  }, [ready, hasCourierMarker, courier?.vehicle, phase]);

  // Enquadra o que importa na fase: entregador e loja, depois entregador e casa.
  const fitKey = `${phase}|${routeKey}|${!!courier}|${storePt?.lat}|${homePt?.lat}`;
  const fit = (animate: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    const pts: Pt[] = [];
    if (phase === 'to_store') { if (courier) pts.push(courier); if (storePt) pts.push(storePt); if (homePt) pts.push(homePt); }
    else if (phase === 'to_customer') { if (courier) pts.push(courier); if (homePt) pts.push(homePt); if (!courier && route) pts.push(...route); }
    else { if (route) pts.push(...route); else { if (storePt) pts.push(storePt); if (homePt) pts.push(homePt); } }
    if (!pts.length) return;
    if (pts.length === 1) { map.easeTo({ center: pts[0], zoom: 15, duration: animate ? 800 : 0 }); return; }
    const lngs = pts.map(p => p.lng), lats = pts.map(p => p.lat);
    map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: { top: 56, bottom: 40, left: 48, right: 48 }, maxZoom: 16, duration: animate ? 800 : 0 });
  };
  useEffect(() => {
    if (!ready || !followed) return;
    fit(true);
  }, [ready, fitKey, followed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Seguindo: se o entregador sair da tela, reenquadra.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !followed || !courier) return;
    if (!map.getBounds().contains([courier.lng, courier.lat])) fit(true);
  }, [ready, courier?.lat, courier?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) {
    return (
      <div className="h-64 flex items-center justify-center rounded-2xl bg-warm border border-mist px-6 text-center text-[12px] text-faint">
        Seu navegador não conseguiu abrir o mapa. Use o link de rastreio da Uber abaixo.
      </div>
    );
  }

  return (
    <div className="sd-map relative h-72 sm:h-80 w-full overflow-hidden rounded-2xl border border-mist bg-[#EEF0F2] isolate">
      <div ref={containerRef} className="h-full w-full" />
      {!followed && (
        <button
          type="button"
          onClick={() => { setFollowed(true); fit(true); }}
          className="absolute left-3 bottom-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[12px] font-semibold text-[#111] shadow-[0_2px_10px_rgba(0,0,0,0.18)] hover:bg-[#F3F3F3] transition-colors"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
          Centralizar
        </button>
      )}
      <style jsx global>{`
        .sd-map .maplibregl-ctrl-attrib { font-size: 10px; }
        .sd-pin { display: flex; align-items: center; gap: 6px; pointer-events: none; }
        .sd-pin-left { flex-direction: row-reverse; }
        .sd-dot { width: 14px; height: 14px; border-radius: 9999px; background: ${INK}; border: 3px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.35); flex: none; }
        .sd-dot-store { border-radius: 3px; }
        .sd-tag { display: inline-flex; align-items: center; gap: 6px; background: ${INK}; color: #fff; font: 600 12px/1.2 system-ui, -apple-system, sans-serif; padding: 6px 8px; box-shadow: 0 2px 8px rgba(0,0,0,.25); white-space: nowrap; max-width: 180px; }
        .sd-tag-text { overflow: hidden; text-overflow: ellipsis; }
        .sd-eta { background: #fff; color: ${INK}; padding: 2px 6px; font-weight: 700; }
        .sd-eta[hidden] { display: none; }
        .sd-courier { display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
        .sd-halo { position: absolute; left: 50%; top: 50%; margin: -28px 0 0 -28px; width: 56px; height: 56px; border-radius: 9999px; background: rgba(17,17,17,.12); animation: sd-pulse 2s ease-out infinite; }
        .sd-vehicle { position: relative; display: flex; }
        @keyframes sd-pulse { 0% { transform: scale(.4); opacity: .9; } 100% { transform: scale(1.3); opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { .sd-halo { animation: none; opacity: .5; } }
      `}</style>
    </div>
  );
}
