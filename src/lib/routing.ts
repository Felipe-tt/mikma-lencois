// Rota real (seguindo as ruas) entre loja e cliente, via OpenRouteService
// (openrouteservice.org) — mesma família do OpenStreetMap que o projeto já
// usa pra geocodificar CEP. Plano gratuito: 2000 requisições/dia, 40/min.
//
// Só é chamado UMA VEZ por entrega (quando o motoboy é atribuído), não a
// cada atualização de localização — a rota loja→cliente não muda, só a
// posição do motoboy ao longo dela. Isso mantém o uso bem abaixo do limite
// gratuito mesmo com muitos pedidos.
//
// Sem ORS_API_KEY configurada: retorna null e quem chamou deve cair pra
// exibir só uma linha reta entre os pontos (ainda funcional, só não segue
// as ruas de verdade).

export interface RoutePoint {
  lat: number;
  lng: number;
}

// Uber Direct informa o tipo de veículo do entregador — mapeia pro perfil
// de roteamento mais parecido que o ORS oferece.
export function vehicleTypeToProfile(vehicleType?: string): string {
  switch (vehicleType) {
    case 'bicycle':
      return 'cycling-regular';
    case 'walker':
      return 'foot-walking';
    case 'scooter':
    case 'motorcycle':
    case 'car':
    default:
      return 'driving-car';
  }
}

/**
 * Busca a rota entre dois pontos. Retorna a lista de coordenadas
 * [lat, lng] (já convertida do formato [lng, lat] do GeoJSON) pra plotar
 * direto num mapa Leaflet, ou null se a API não estiver configurada ou a
 * requisição falhar (best-effort — nunca lança).
 */
export async function fetchRoute(
  origin: RoutePoint,
  destination: RoutePoint,
  vehicleType?: string
): Promise<RoutePoint[] | null> {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) return null;

  const profile = vehicleTypeToProfile(vehicleType);
  const url = `https://api.openrouteservice.org/v2/directions/${profile}/geojson`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        coordinates: [
          [origin.lng, origin.lat],
          [destination.lng, destination.lat],
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.warn('[routing] ORS respondeu', res.status, await res.text().catch(() => ''));
      return null;
    }

    const data = await res.json();
    const coords: [number, number][] | undefined = data?.features?.[0]?.geometry?.coordinates;
    if (!coords || coords.length === 0) return null;

    // GeoJSON vem como [lng, lat] — Leaflet espera [lat, lng].
    return coords.map(([lng, lat]) => ({ lat, lng }));
  } catch (err) {
    console.warn('[routing] falha ao buscar rota (best-effort, ignorado):', err);
    return null;
  }
}
