import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp, tooManyRequests, extractBearer } from '@/lib/security';
import { normalizeTrackingCode, isCorreiosTrackingCode, carrierName, trackingUrl } from '@/lib/carriers';
import { effectiveRole } from '@/lib/staffMfa';

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
  if (!await rateLimit(`tracking:${ip}`, 30, 60_000)) {
    return tooManyRequests(rateLimitRetryAfter(`tracking:${ip}`));
  }

  const { code } = await params;

  // Normaliza uma vez só: maiúsculas e sem espaço/traço/pontuação, pra não
  // depender de como o vendedor colou o código (com espaço, minúsculo etc).
  // Antes a detecção usava o código "cru" e só limpava mais embaixo (Modo 1),
  // então um código com espaço no meio passava batido pelo isCorreiosCode e
  // caía (errado) no fluxo de orderId.
  const clean = normalizeTrackingCode(code);

  // Modo 1: código de rastreio do Correios (formato AAA000000000BR)
  const isCorreiosCode = isCorreiosTrackingCode(clean);

  // Modo 2: orderId do Firestore (usa o código salvo no pedido)
  const isFirestoreOrder = !isCorreiosCode && code.length > 13;

  if (isFirestoreOrder) {
    // IDOR corrigido: rastrear por orderId exige ser o dono do pedido ou
    // ser seller/admin, sem isso, qualquer pessoa que soubesse (ou
    // adivinhasse) um orderId conseguia ver status de entrega e
    // transportadora de pedidos de outras contas, sem estar logada.
    const bearer = extractBearer(req);
    if ('response' in bearer) return bearer.response;

    let requesterUid: string;
    let requesterRole: string | undefined;
    try {
      const decoded = await adminAuth.verifyIdToken(bearer.token, true);
      requesterUid = decoded.uid;
      requesterRole = effectiveRole(decoded);
    } catch {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Busca o pedido no Firestore para pegar o código e a transportadora
    try {
      const orderSnap = await adminDb.collection('orders').doc(code).get();
      if (!orderSnap.exists) {
        return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
      }
      const order = orderSnap.data()!;

      if (order.userId !== requesterUid && requesterRole !== 'seller' && requesterRole !== 'admin') {
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
      }

      const trackCode = order.delivery?.trackingCode as string | undefined;
      const carrier   = (order.delivery?.carrier ?? order.selectedShipping?.carrier) as string | undefined;

      if (!trackCode) {
        return NextResponse.json({ error: 'Envio ainda sem código de rastreio' }, { status: 404 });
      }

      const result: TrackingResult = {
        code: trackCode,
        service: carrier ? carrierName(carrier) : undefined,
        events: [],
        trackingUrl: (order.delivery?.trackingUrl as string | undefined)
          ?? (carrier ? trackingUrl(carrier, trackCode) : null),
        updatedAt: new Date().toISOString(),
        source: 'live',
      };

      // Código dos Correios: busca os eventos detalhados. Jadlog não tem API
      // pública de rastreio, fica só o link pro site deles.
      const trackCodeClean = normalizeTrackingCode(trackCode);
      if (isCorreiosTrackingCode(trackCodeClean)) {
        const correiosResult = await fetchCorreios(trackCodeClean);
        if (correiosResult) {
          result.events = correiosResult.events;
          result.service = correiosResult.service;
        }
      }

      return NextResponse.json(result);
    } catch (err) {
      console.error('tracking por pedido error:', err);
      return NextResponse.json({ error: 'Erro ao buscar rastreio' }, { status: 500 });
    }
  }

  // Modo 1: Correios via Link&Track
  if (clean.length < 10 || clean.length > 13) {
    return NextResponse.json({ error: 'Código inválido' }, { status: 400 });
  }

  const cacheRef = adminDb.collection('trackingCache').doc(clean);
  const cacheSnap = await cacheRef.get();
  // expireAt é só para o TTL do Firestore, não vai na resposta.
  const { expireAt: _expireAt, ...cached } = (cacheSnap.data() ?? {}) as Partial<TrackingResult> & { expireAt?: unknown };
  if (cacheSnap.exists && Date.now() - new Date(cached.updatedAt!).getTime() < CACHE_TTL_MS) {
    return NextResponse.json({ ...cached, source: 'cache' });
  }

  const result = await fetchCorreios(clean);
  if (!result) {
    if (cacheSnap.exists) return NextResponse.json({ ...cached, source: 'cache' });
    return NextResponse.json({ error: 'Código não encontrado. Pode levar até 24h após a postagem.' }, { status: 404 });
  }

  // expireAt: o TTL do Firestore apaga código sem consulta há 3 dias.
  await cacheRef.set({ ...result, expireAt: new Date(Date.now() + 3 * 86_400_000) });
  return NextResponse.json(result);
}
