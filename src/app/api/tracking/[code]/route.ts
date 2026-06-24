export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { getClientIp, tooManyRequests } from '@/lib/security';

export interface TrackingEvent {
  date: string;   // "DD/MM/AAAA"
  time: string;   // "HH:MM"
  location: string;
  status: string;
  subStatus?: string[];
}

export interface TrackingResult {
  code: string;
  service?: string;
  events: TrackingEvent[];
  updatedAt: string;
  source: 'cache' | 'live';
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos

// Token demo público da Link & Track — funciona sem cadastro
const LT_USER  = process.env.LINKETRACK_USER  ?? 'teste';
const LT_TOKEN = process.env.LINKETRACK_TOKEN ?? '1abcd00b2731640e886fb41a8a9671ad1434c599dbaa0a0de9a5aa619f29a83f';

async function fetchFromLinkeTrack(code: string): Promise<TrackingResult | null> {
  try {
    const url = `https://api.linketrack.com/track/json?user=${LT_USER}&token=${LT_TOKEN}&codigo=${encodeURIComponent(code)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;

    const data = await res.json();
    if (!data || data.quantidade === 0) return null;

    const events: TrackingEvent[] = (data.eventos ?? []).map((ev: {
      data: string; hora: string; local: string; status: string; subStatus?: string[];
    }) => ({
      date: ev.data,
      time: ev.hora,
      location: ev.local,
      status: ev.status,
      subStatus: ev.subStatus ?? [],
    }));

    return {
      code,
      service: data.servico ?? undefined,
      events,
      updatedAt: new Date().toISOString(),
      source: 'live',
    };
  } catch {
    return null;
  }
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
  const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length < 10 || clean.length > 13) {
    return NextResponse.json({ error: 'Código inválido' }, { status: 400 });
  }

  // 1. Tenta cache no Firestore
  const cacheRef = adminDb.collection('trackingCache').doc(clean);
  const cacheSnap = await cacheRef.get();
  if (cacheSnap.exists) {
    const cached = cacheSnap.data() as TrackingResult;
    const age = Date.now() - new Date(cached.updatedAt).getTime();
    if (age < CACHE_TTL_MS) {
      return NextResponse.json({ ...cached, source: 'cache' });
    }
  }

  // 2. Busca na Link & Track
  const result = await fetchFromLinkeTrack(clean);
  if (!result) {
    // Retorna cache antigo se tiver, ou erro
    if (cacheSnap.exists) {
      return NextResponse.json({ ...cacheSnap.data(), source: 'cache' });
    }
    return NextResponse.json(
      { error: 'Código não encontrado nos Correios. Pode levar até 24h para aparecer após a postagem.' },
      { status: 404 }
    );
  }

  // 3. Salva cache
  await cacheRef.set(result);

  return NextResponse.json(result);
}
