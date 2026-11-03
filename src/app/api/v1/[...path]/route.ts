import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/security';
import { isHoneyApiKey, triggerHoneytoken } from '@/lib/honeytoken';

/**
 * "API de parceiros" que não existe: é a armadilha da chave falsa guardada
 * no Firestore (ver lib/honeytoken.ts). Responde sempre como chave inválida;
 * se a chave usada for a falsa, avisa a equipe.
 */
async function handle(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const header = req.headers.get('authorization') ?? '';
  const candidates = [
    header.replace(/^Bearer\s+/i, ''),
    req.headers.get('x-api-key'),
    req.nextUrl.searchParams.get('api_key'),
    req.nextUrl.searchParams.get('key'),
  ];
  const secret = process.env.STAFF_SESSION_SECRET;
  if (candidates.some(c => isHoneyApiKey(c, secret))) {
    await triggerHoneytoken({
      kind: 'chave-api',
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
      detail: `${req.method} /api/v1/${path.join('/').slice(0, 200)}`,
      country: req.headers.get('cf-ipcountry'),
    });
  }
  return NextResponse.json({ error: 'invalid_api_key' }, { status: 401 });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
