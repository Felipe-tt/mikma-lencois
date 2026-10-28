import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { extractBearer, getClientIp } from '@/lib/security';
import { cameThroughEdge } from '@/lib/ip';

/**
 * GET /api/painel/ip-check (só admin)
 *
 * Diagnóstico: mostra de onde o site está tirando o IP do visitante em
 * produção (App Hosting, Cloudflare). Serve pra conferir que os limites por
 * IP usam o IP real e não um header que o visitante poderia forjar.
 */
export async function GET(req: NextRequest) {
  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    if ((decoded as { role?: string }).role !== 'admin') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  } catch {
    return NextResponse.json({ error: 'Sua sessão expirou. Entre de novo.' }, { status: 401 });
  }
  const h = req.headers;
  return NextResponse.json({
    usado: getClientIp(req),
    viaCloudflare: cameThroughEdge(h),
    'x-fah-client-ip': h.get('x-fah-client-ip'),
    'cf-connecting-ip': h.get('cf-connecting-ip'),
    'x-forwarded-for': h.get('x-forwarded-for'),
    'fastly-client-ip': h.get('fastly-client-ip'),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
