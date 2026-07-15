import { NextRequest, NextResponse } from 'next/server';
import type { NextFetchEvent } from 'next/server';

// ── Firestore REST (Edge Runtime não suporta Firebase Admin SDK) ──────────────

// Cache em memória do status de manutenção. Sem isso, TODA requisição que
// chega no Cloud Run (inclusive bots/scanners batendo em URLs aleatórias,
// tipo /wp-login.php, /.env etc.) dispara uma chamada de rede ao Firestore
// antes mesmo de saber se a página existe — isso custa dinheiro em cada
// invocação (tempo de CPU do round-trip) e em leituras do Firestore, 24/7,
// mesmo com o site nunca em manutenção.
// TTL curto (15s) porque o toggle de manutenção já força um cache-bust via
// revalidatePath('/', 'layout') na API — o pior caso aqui é só um atraso
// extra de até 15s pra propagar, o que é inofensivo pra uma ação manual e
// rara do admin.
const MAINTENANCE_CACHE_TTL_MS = 15_000;
let maintenanceCache: { active: boolean; expiresAt: number } | null = null;

async function getMaintenanceStatus(projectId: string): Promise<boolean> {
  const now = Date.now();
  if (maintenanceCache && maintenanceCache.expiresAt > now) {
    return maintenanceCache.active;
  }
  try {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/maintenance/status`,
      { signal: AbortSignal.timeout(3000), cache: 'no-store' }
    );
    if (!res.ok) {
      // Não sobrescreve o cache com falha — mantém o último valor conhecido
      // (ou false, se nunca resolveu com sucesso) até a próxima tentativa.
      return maintenanceCache?.active ?? false;
    }
    const data = await res.json();
    const active = data?.fields?.active?.booleanValue ?? false;
    maintenanceCache = { active, expiresAt: now + MAINTENANCE_CACHE_TTL_MS };
    return active;
  } catch {
    return maintenanceCache?.active ?? false;
  }
}

async function isIpReleased(projectId: string, docId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/maintenance_queue/${docId}`,
      { signal: AbortSignal.timeout(3000), cache: 'no-store' }
    );
    if (!res.ok) return false;
    const data = await res.json();
    return data?.fields?.released?.booleanValue ?? false;
  } catch {
    return false;
  }
}

async function lookupIpGeo(ip: string): Promise<{ city: string; region: string; country: string; isp: string; debugError: string }> {
  // IPs locais/privados não são geolocalizáveis
  if (ip === '0.0.0.0' || ip.startsWith('127.') || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { city: '', region: '', country: '', isp: '', debugError: 'ip_local' };
  }

  // ipapi.co bloqueia/rate-limita IPs de cloud providers (GCP, AWS, Azure).
  // Tentamos múltiplas APIs em sequência — a primeira que responder com sucesso vence.
  // ip-api.com (HTTP) e freeipapi.com funcionam bem de cloud; ipapi.co fica por último.
  type GeoResult = { city: string; region: string; country: string; isp: string; debugError: string };
  const attempts: Array<() => Promise<GeoResult | null>> = [
    // 1. ip-api.com — funciona de cloud, sem chave, 45 req/min grátis
    async () => {
      const res = await fetch(
        `http://ip-api.com/json/${ip}?fields=status,city,regionName,country,org`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (!res.ok) return null;
      const d = await res.json();
      if (d.status !== 'success') return null;
      return { city: d.city ?? '', region: d.regionName ?? '', country: d.country ?? '', isp: d.org ?? '', debugError: '' };
    },
    // 2. freeipapi.com — funciona de cloud, sem chave
    async () => {
      const res = await fetch(
        `https://freeipapi.com/api/json/${ip}`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (!res.ok) return null;
      const d = await res.json();
      if (!d.cityName) return null;
      return { city: d.cityName ?? '', region: d.regionName ?? '', country: d.countryName ?? '', isp: '', debugError: '' };
    },
    // 3. ipapi.co — fallback: funciona de IPs residenciais, mas bloqueia cloud
    async () => {
      const res = await fetch(
        `https://ipapi.co/${ip}/json/`,
        { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'MikmaLencois/1.0' } }
      );
      if (!res.ok) return null;
      const d = await res.json();
      if (d.error) return null;
      return { city: d.city ?? '', region: d.region ?? '', country: d.country_name ?? '', isp: d.org ?? '', debugError: '' };
    },
  ];

  const errors: string[] = [];
  for (let i = 0; i < attempts.length; i++) {
    try {
      const result = await attempts[i]();
      if (result) return result;
      errors.push(`attempt_${i + 1}_no_data`);
    } catch (err) {
      errors.push(`attempt_${i + 1}_${err instanceof Error ? err.message.slice(0, 40) : 'err'}`);
    }
  }
  return { city: '', region: '', country: '', isp: '', debugError: errors.join('|') };
}

// Atualiza só os campos de geo num documento que já existe (PATCH com
// updateMask, pra não sobrescrever `released`/`enteredAt`/etc. que podem
// já ter mudado entre o registro inicial e a geo resolver) — chamada via
// event.waitUntil(), nunca aguardada no caminho do redirect.
async function updateGeoInQueue(projectId: string, docId: string, ip: string) {
  const geo = await lookupIpGeo(ip);
  const fieldPaths = ['geoCity', 'geoRegion', 'geoCountry', 'isp', 'geoDebug']
    .map(f => `updateMask.fieldPaths=${f}`)
    .join('&');
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/maintenance_queue/${docId}?${fieldPaths}`;
  const fields = {
    geoCity: { stringValue: geo.city },
    geoRegion: { stringValue: geo.region },
    geoCountry: { stringValue: geo.country },
    isp: { stringValue: geo.isp },
    geoDebug: { stringValue: geo.debugError },
  };
  try {
    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
      signal: AbortSignal.timeout(6000),
    });
  } catch { /* silencioso — best-effort, não afeta o visitante */ }
}

// Bots/crawlers que não devem poluir a fila de manutenção — não são
// visitantes reais esperando acesso, e não faz sentido o admin ficar
// vendo "GoogleBot entrou na fila".
const BOT_UA_PATTERN = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|discordbot|semrush|ahrefs|mj12bot|dotbot|petalbot|yandex|baidu|duckduckbot|nutch|scrapy|python-requests|curl\/|wget\/|headless|phantomjs|okhttp|libwww-perl|go-http-client/i;

function isBotUserAgent(ua: string): boolean {
  return BOT_UA_PATTERN.test(ua);
}

async function registerInQueue(projectId: string, docId: string, ip: string, req: NextRequest) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/maintenance_queue/${docId}`;
  const userAgent = req.headers.get('user-agent') ?? '';
  const fields: Record<string, unknown> = {
    ip: { stringValue: ip },
    released: { booleanValue: false },
    enteredAt: { stringValue: new Date().toISOString() },
    userAgent: { stringValue: userAgent },
    isBot: { booleanValue: isBotUserAgent(userAgent) },
    referer: { stringValue: req.headers.get('referer') ?? '' },
    acceptLanguage: { stringValue: req.headers.get('accept-language') ?? '' },
    requestedPath: { stringValue: req.nextUrl.pathname + req.nextUrl.search },
    platform: { stringValue: (req.headers.get('sec-ch-ua-platform') ?? '').replace(/"/g, '') },
    isMobile: { stringValue: req.headers.get('sec-ch-ua-mobile') ?? '' },
    geoCity: { stringValue: '' },
    geoRegion: { stringValue: '' },
    geoCountry: { stringValue: '' },
    isp: { stringValue: '' },
    geoDebug: { stringValue: 'pending' },
  };
  try {
    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
      signal: AbortSignal.timeout(3000),
    });
  } catch { /* silencioso */ }
}

// ── Security headers (aplicados em todas as respostas) ───────────────────────

function applySecurityHeaders(res: NextResponse): void {
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('X-DNS-Prefetch-Control', 'off');
  res.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()');
  res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.headers.set('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://apis.google.com https://www.gstatic.com https://www.google.com https://www.recaptcha.net https://accounts.google.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://lh3.googleusercontent.com https://d1w2poirtb3as9.cloudfront.net https://*.tile.openstreetmap.org",
    "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://accounts.google.com https://oauth2.googleapis.com https://api.abacatepay.com https://viacep.com.br https://nominatim.openstreetmap.org https://www.thecolorapi.com https://tessdata.projectnaptha.com https://cdn.jsdelivr.net https://unpkg.com https://storage.googleapis.com https://*.ingest.us.sentry.io https://*.ingest.sentry.io",
    "frame-src https://www.google.com https://recaptcha.google.com https://accounts.google.com https://*.firebaseapp.com https://*.web.app",
    "worker-src 'self' blob: https://cdn.jsdelivr.net https://unpkg.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "upgrade-insecure-requests",
  ].join('; '));
  res.headers.delete('Server');
  res.headers.delete('X-Powered-By');
}

// ── Middleware principal ──────────────────────────────────────────────────────

export async function middleware(req: NextRequest, event: NextFetchEvent) {
  const { pathname } = req.nextUrl;

  const isExempt =
    pathname.startsWith('/painel') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/monitoring') ||
    pathname.startsWith('/manutencao') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/logo') ||
    pathname.startsWith('/og-') ||
    pathname.startsWith('/hero-') ||
    pathname.startsWith('/sobre-') ||
    pathname.startsWith('/apple-') ||
    pathname.startsWith('/google') ||
    pathname.startsWith('/robots') ||
    pathname.startsWith('/sitemap');

  if (!isExempt) {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'mikma-lencois';
    // Mesmo cuidado do getClientIp em lib/security.ts: usa o ÚLTIMO IP da
    // lista (anexado pelo proxy confiável), não o primeiro (forjável pelo
    // cliente) — evita que alguém entre na fila de manutenção disfarçado
    // de outro visitante, ou vaze o mesmo IP falso repetidas vezes.
    const xff = req.headers.get('x-forwarded-for');
    const xffParts = xff ? xff.split(',').map((p) => p.trim()).filter(Boolean) : [];
    const ip = xffParts.length > 0
      ? xffParts[xffParts.length - 1]
      : req.headers.get('x-real-ip') || '0.0.0.0';
    const docId = ip.replace(/[.:]/g, '_');

    const active = await getMaintenanceStatus(projectId);

    if (active) {
      const released = await isIpReleased(projectId, docId);

      if (!released) {
        await registerInQueue(projectId, docId, ip, req);
        // Geo não bloqueia o redirect — ipapi.co pode levar até alguns
        // segundos, e o visitante não deve esperar isso pra ver a página
        // de manutenção. waitUntil mantém a isolate viva até o PATCH de
        // geo terminar, mesmo depois da resposta já ter sido enviada.
        event.waitUntil(updateGeoInQueue(projectId, docId, ip));
        const redirectRes = NextResponse.redirect(new URL('/manutencao', req.url));
        redirectRes.headers.set('Cache-Control', 'no-store, must-revalidate');
        applySecurityHeaders(redirectRes);
        return redirectRes;
      }
    }
  }

  const res = NextResponse.next();
  applySecurityHeaders(res);

  // Páginas do painel e auth: nunca cachear (dados do usuário)
  // Páginas da loja: deixar o Next.js/CDN cachearem normalmente via ISR
  // O middleware já garantiu que manutenção ativa redireciona antes de chegar aqui
  if (
    pathname.startsWith('/painel') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/conta') ||
    pathname.startsWith('/perfil') ||
    pathname.startsWith('/pedidos') ||
    pathname.startsWith('/checkout') ||
    pathname.startsWith('/carrinho') ||
    pathname.startsWith('/entrar') ||
    pathname.startsWith('/cadastro') ||
    pathname.startsWith('/redefinir-senha') ||
    pathname.startsWith('/confirmar-email')
  ) {
    res.headers.set('Cache-Control', 'private, no-store');
  }
  // Páginas públicas da loja (/, /produtos, /sobre, etc.) NÃO recebem Cache-Control aqui
  // — o Next.js ISR cuida disso via revalidate nas páginas

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon|logo|public|icons|manifest).*)'],
};
