export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { meTracking } from '@/lib/melhorenvio';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp, tooManyRequests } from '@/lib/security';

export interface TrackingEvent {
  date: string;
  time: string;
  location: string;
  status: string;
  subStatus?: string[];
}

export interface TrackingResult {
  code: string;
  service?: string;
  events: TrackingEvent[];
  trackingUrl?: string | null;  // URL externa para rastrear (Jadlog, Correios, etc)
  updatedAt: string;
  source: 'cache' | 'live';
}

const CACHE_TTL_MS = 30 * 60 * 1000;

const LT_USER  = process.env.LINKETRACK_USER;
const LT_TOKEN = process.env.LINKETRACK_TOKEN;

async function fetchCorreios(code: string): Promise<TrackingResult | null> {
  if (!LT_USER || !LT_TOKEN) {
    console.error('[tracking] LINKETRACK_USER/LINKETRACK_TOKEN não configurados');
    return null;
  }
  try {
    const url = `https://api.linketrack.com/track/json?user=${LT_USER}&token=${LT_TOKEN}&codigo=${encodeURIComponent(code)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.quantidade === 0) return null;

    const events: TrackingEvent[] = (data.eventos ?? []).map((ev: {
      data: string; hora: string; local: string; status: string; subStatus?: string[];
    }) => ({
      date: ev.data, time: ev.hora, location: ev.local,
      status: ev.status, subStatus: ev.subStatus ?? [],
    }));

    return { code, service: data.servico, events, updatedAt: new Date().toISOString(), source: 'live' };
  } catch { return null; }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const ip = getClientIp(req);
  if (!rateLimit(`tracking:${ip}`, 30, 60_000)) {
    return tooManyRequests(rateLimitRetryAfter(`tracking:${ip}`));
  }

  const { code } = await params;

  // Modo 1: código de rastreio do Correios (formato AAA000000000BR)
  const isCorreiosCode = /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(code.trim().toUpperCase());

  // Modo 2: orderId do Firestore (para buscar via Melhor Envio)
  const isFirestoreOrder = !isCorreiosCode && code.length > 13;

  if (isFirestoreOrder) {
    // Busca o pedido no Firestore para pegar o melhorEnvioOrderId e trackingUrl
    try {
      const orderSnap = await adminDb.collection('orders').doc(code).get();
      if (!orderSnap.exists) {
        return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
      }
      const order = orderSnap.data()!;
      const meOrderId = order.delivery?.melhorEnvioOrderId;
      const trackCode = order.delivery?.trackingCode;

      if (!meOrderId) {
        return NextResponse.json({ error: 'Envio ainda não processado pela Melhor Envio' }, { status: 404 });
      }

      // Busca status na Melhor Envio
      const [meStatus] = await meTracking([meOrderId]);

      const result: TrackingResult = {
        code: trackCode ?? meOrderId,
        service: order.delivery?.carrier?.replace(/_/g, ' '),
        events: meStatus ? [{
          date: new Date().toLocaleDateString('pt-BR'),
          time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          location: '',
          status: {
            pending:   'Aguardando processamento',
            released:  'Etiqueta gerada',
            posted:    'Postado',
            delivered: 'Entregue',
            canceled:  'Cancelado',
          }[meStatus.status] ?? meStatus.status,
        }] : [],
        trackingUrl: meStatus?.tracking_url ?? null,
        updatedAt: new Date().toISOString(),
        source: 'live',
      };

      // Se tem tracking_url e é dos Correios, busca eventos detalhados
      if (trackCode && isCorreiosCode) {
        const correiosResult = await fetchCorreios(trackCode);
        if (correiosResult) {
          result.events = correiosResult.events;
          result.service = correiosResult.service;
        }
      }

      return NextResponse.json(result);
    } catch (err) {
      console.error('tracking via ME error:', err);
      return NextResponse.json({ error: 'Erro ao buscar rastreio' }, { status: 500 });
    }
  }

  // Modo 1: Correios via Link&Track
  const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length < 10 || clean.length > 13) {
    return NextResponse.json({ error: 'Código inválido' }, { status: 400 });
  }

  const cacheRef = adminDb.collection('trackingCache').doc(clean);
  const cacheSnap = await cacheRef.get();
  if (cacheSnap.exists) {
    const cached = cacheSnap.data() as TrackingResult;
    const age = Date.now() - new Date(cached.updatedAt).getTime();
    if (age < CACHE_TTL_MS) return NextResponse.json({ ...cached, source: 'cache' });
  }

  const result = await fetchCorreios(clean);
  if (!result) {
    if (cacheSnap.exists) return NextResponse.json({ ...cacheSnap.data(), source: 'cache' });
    return NextResponse.json({ error: 'Código não encontrado. Pode levar até 24h após a postagem.' }, { status: 404 });
  }

  await cacheRef.set(result);
  return NextResponse.json(result);
}
