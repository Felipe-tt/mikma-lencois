import { NextRequest, NextResponse } from 'next/server';
import { STAFF_SESSION_COOKIE, verifyStaffSession } from '@/lib/staffSession';

// ── Firestore REST (Edge Runtime não suporta Firebase Admin SDK) ──────────────

// Fica atrás do Firebase Hosting. Manutenção precisa valer o quanto antes pra
// TODA requisição a partir do toggle. (Havia um cache de 15s por instância
// antes; foi removido porque deixava o site visível por alguns segundos
// depois de ativar a manutenção.)
//
// Reintroduzimos um cache, mas bem mais curto (2s) e só em memória do
// isolate, não é um cache "pra economizar", é pra evitar que TODA
// requisição pague uma ida e volta ao Firestore antes de renderizar
// qualquer página (isso estava anulando boa parte do ganho do ISR/CDN e
// aumentando o custo de invocação). 2s é uma janela bem menor que os 15s
// que causaram o problema anterior, na prática, o pior caso é alguém ver
// o site por até 2s depois do toggle, contra os "zero cache" de antes.
// Se essa troca não for aceitável, é só zerar MAINTENANCE_CACHE_TTL_MS.
const MAINTENANCE_CACHE_TTL_MS = 2000;
let maintenanceCache: { value: boolean; expiresAt: number } | null = null;

async function fetchMaintenanceDoc(projectId: string): Promise<Response> {
  return fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/maintenance/status`,
    { signal: AbortSignal.timeout(3000), cache: 'no-store' }
  );
}

async function getMaintenanceStatus(projectId: string): Promise<boolean> {
  const now = Date.now();
  if (maintenanceCache && maintenanceCache.expiresAt > now) {
    return maintenanceCache.value;
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchMaintenanceDoc(projectId);
      if (!res.ok) continue;
      const data = await res.json();
      const active = data?.fields?.active?.booleanValue ?? false;
      maintenanceCache = { value: active, expiresAt: now + MAINTENANCE_CACHE_TTL_MS };
      return active;
    } catch {
      // tenta mais uma vez antes de desistir
    }
  }
  return false;
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

// Bots/crawlers que não devem poluir a fila de manutenção, não são
// visitantes reais esperando acesso, e não faz sentido o admin ficar
// vendo "GoogleBot entrou na fila".
const BOT_UA_PATTERN = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|discordbot|semrush|ahrefs|mj12bot|dotbot|petalbot|yandex|baidu|duckduckbot|nutch|scrapy|python-requests|curl\/|wget\/|headless|phantomjs|okhttp|libwww-perl|go-http-client/i;

function isBotUserAgent(ua: string): boolean {
  return BOT_UA_PATTERN.test(ua);
}

// Paths que só existem em varreduras automáticas de vulnerabilidade (não
// tem WordPress, PHP, ou XML-RPC nesse projeto). Rejeitar aqui, antes de
// qualquer leitura/escrita no Firestore ou lookup de geo, corta o custo
// desses scans a praticamente zero: é só um 404 estático, sem tocar em
// nada além do próprio isolate.
const SCANNER_PATH_PATTERN = /^\/(wp-admin|wp-login|wp-content|wp-includes|wp-json|xmlrpc\.php|\.env|\.git|phpmyadmin|admin\.php|config\.php|_ignition|actuator|\.well-known\/traffic-advice)/i;

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
    "script-src 'self' 'unsafe-inline' https://apis.google.com https://www.gstatic.com https://www.google.com https://www.recaptcha.net https://accounts.google.com https://www.googletagmanager.com https://connect.facebook.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://lh3.googleusercontent.com https://d1w2poirtb3as9.cloudfront.net https://*.tile.openstreetmap.org https://www.facebook.com",
    // www.google.com também em connect-src (não só script-src): o próprio
    // script do reCAPTCHA faz uma chamada de rede pra /recaptcha/api2/clr,
    // sem isso ela quebrava silenciosamente por CSP (bug preexistente,
    // achado ao investigar por que o GA4 não carregava).
    "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://accounts.google.com https://oauth2.googleapis.com https://api.abacatepay.com https://viacep.com.br https://nominatim.openstreetmap.org https://www.thecolorapi.com https://tessdata.projectnaptha.com https://cdn.jsdelivr.net https://unpkg.com https://storage.googleapis.com https://*.ingest.us.sentry.io https://*.ingest.sentry.io https://www.google.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.facebook.com",
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

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Scanners de vulnerabilidade (procurando WordPress/PHP que não existe
  // aqui) batem constantemente em qualquer domínio público na internet,
  // 24h por dia, independente de tráfego real. Sem essa checagem, cada
  // uma dessas tentativas passava pelo fluxo completo de manutenção
  // (Firestore + geo lookup) só pra no fim dar 404 de qualquer forma.
  if (SCANNER_PATH_PATTERN.test(pathname)) {
    return new NextResponse(null, { status: 404 });
  }

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
    // Mesmo cuidado do getClientIp em lib/security.ts: este app fica atrás
    // do Firebase Hosting (servido pela Fastly), então o ÚLTIMO valor do
    // X-Forwarded-For é a infraestrutura da Fastly, não o visitante, daí
    // a fila de manutenção e o "liberar IP" nunca baterem com o IP real de
    // ninguém. O IP real vem em fastly-client-ip. X-Forwarded-For (último
    // valor) só como fallback pra quando não tem Firebase Hosting na
    // frente (ex: emulador local batendo direto no Cloud Run).
    const fastlyIp = req.headers.get('fastly-client-ip');
    let ip = fastlyIp?.trim() || '';
    if (!ip) {
      const xff = req.headers.get('x-forwarded-for');
      const xffParts = xff ? xff.split(',').map((p) => p.trim()).filter(Boolean) : [];
      ip = xffParts.length > 0
        ? xffParts[xffParts.length - 1]
        : req.headers.get('x-real-ip') || '0.0.0.0';
    }
    const docId = ip.replace(/[.:]/g, '_');

    const active = await getMaintenanceStatus(projectId);

    if (active) {
      // Staff logado (seller/admin) sempre vê o site normal, independente
      // de IP liberado, não faz sentido pedir pra quem está trabalhando
      // no painel também ficar liberando o próprio IP toda vez que a rede
      // muda (café, 4G, trabalho remoto etc.). Importante: NÃO retorna
      // direto aqui, só pula o bloqueio, pra continuar o fluxo normal
      // (headers de segurança, cache-control etc. aplicados mais abaixo).
      let staffBypass = false;
      const staffCookie = req.cookies.get(STAFF_SESSION_COOKIE)?.value;
      const staffSecret = process.env.STAFF_SESSION_SECRET;
      if (staffCookie && staffSecret) {
        staffBypass = !!(await verifyStaffSession(staffCookie, staffSecret));
      }

      if (!staffBypass) {
        const released = await isIpReleased(projectId, docId);

        if (!released) {
          const userAgent = req.headers.get('user-agent') ?? '';
          const isBot = isBotUserAgent(userAgent);

          // Bots reconhecidos (crawlers, monitoramento, ferramentas de
          // scraping) não precisam entrar na fila de "quem está esperando
          // acesso" nem ter IP geolocalizado - isso só existe pra dar
          // visibilidade de visitante real esperando no painel. Pular
          // esse trabalho pra bots corta a maior fonte de custo: cada
          // hit de bot deixa de gerar uma escrita no Firestore.
          if (!isBot) {
            await registerInQueue(projectId, docId, ip, req);
          }

          const redirectRes = NextResponse.redirect(new URL('/manutencao', req.url));
          redirectRes.headers.set('Cache-Control', 'no-store, must-revalidate');
          applySecurityHeaders(redirectRes);
          return redirectRes;
        }
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
  //, o Next.js ISR cuida disso via revalidate nas páginas

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon|logo|public|icons|manifest).*)'],
};
