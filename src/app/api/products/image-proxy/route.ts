import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, getClientIp, tooManyRequests } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';

// Hosts do Firebase Storage / Google Cloud Storage cujo conteúdo é seguro
// fazer proxy (são os mesmos domínios já liberados em img-src no middleware).
const ALLOWED_HOSTS = new Set(['firebasestorage.googleapis.com', 'storage.googleapis.com']);

/**
 * Proxy de imagens do Storage para uso no color picker (PhotoColorPicker).
 *
 * Por que existe: o componente precisa desenhar a foto num <canvas> e ler
 * pixels com getImageData() para extrair a cor exata. Buscar a URL do
 * Storage diretamente via fetch() no browser falha, porque o Firebase
 * Storage não envia o header Access-Control-Allow-Origin por padrão
 * (precisaria de `gsutil cors set` no bucket, fora do escopo do código).
 * Sem esse header, fetch() é bloqueado pela política de CORS do navegador.
 *
 * Um fetch feito aqui no servidor não tem essa restrição — CORS é uma
 * regra do navegador, não existe entre servidores — então repassamos os
 * bytes já prontos para o client, que nunca precisa tocar a URL cross-origin.
 */
export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  if (!await rateLimit(`image-proxy:${ip}`, 60, 60_000)) {
    return tooManyRequests(rateLimitRetryAfter(`image-proxy:${ip}`));
  }

  const auth = await verifyAuth(req, { roles: ['seller', 'admin'] });
  if (!auth.ok) return auth.response;

  const url = req.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'Parâmetro url é obrigatório' }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: 'URL inválida' }, { status: 400 });
  }

  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) {
    return NextResponse.json({ error: 'Origem não permitida' }, { status: 400 });
  }

  try {
    const upstream = await fetch(parsed.toString(), { signal: AbortSignal.timeout(10_000) });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: 'Não foi possível buscar a imagem' }, { status: 502 });
    }

    const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'Recurso não é uma imagem' }, { status: 415 });
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Erro ao buscar a imagem' }, { status: 502 });
  }
}
