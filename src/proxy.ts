import { NextRequest, NextResponse } from 'next/server';
import { STAFF_SESSION_COOKIE, verifyStaffSession } from '@/lib/staffSession';
import { cameThroughEdge, clientIpFromHeaders } from '@/lib/ip';
import { maintenanceDocId, pathOnly } from '@/lib/maintenanceQueue';

// Firebase Emulator Suite em desenvolvimento local (ver lib/firebase/client.ts).
const EMULATOR_CONNECT_SRC =
  process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === '1'
    ? ' http://127.0.0.1:9099 http://127.0.0.1:8080 ws://127.0.0.1:8080'
    : '';

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


// Paths que só existem em varreduras automáticas de vulnerabilidade (não
// tem WordPress, PHP, ou XML-RPC nesse projeto). Rejeitar aqui, antes de
// qualquer leitura/escrita no Firestore ou lookup de geo, corta o custo
// desses scans a praticamente zero: é só um 404 estático, sem tocar em
// nada além do próprio isolate.
const SCANNER_PATH_PATTERN = /^\/(wp-admin|wp-login|wp-content|wp-includes|wp-json|xmlrpc\.php|\.env|\.git|phpmyadmin|admin\.php|config\.php|_ignition|actuator|\.well-known\/traffic-advice)/i;


// ── Security headers (aplicados em todas as respostas) ───────────────────────

// Cartão no próprio site (abacatepay.js): o script da AbacatePay monta os
// campos do cartão e o desafio 3DS em iframes de quem processa o cartão e
// do banco emissor, domínios que a AbacatePay não publica. Só na página de
// checkout a política aceita qualquer origem https para script, iframe e
// rede; no resto do site continua fechada.
const CHECKOUT_PAYMENT_SRC = ' https:';

function applySecurityHeaders(res: NextResponse, pathname = ''): void {
  const pay = pathname === '/checkout' || pathname.startsWith('/checkout/') ? CHECKOUT_PAYMENT_SRC : '';
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('X-DNS-Prefetch-Control', 'off');
  res.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.headers.set('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://apis.google.com https://www.gstatic.com https://www.google.com https://www.recaptcha.net https://accounts.google.com https://www.googletagmanager.com https://connect.facebook.net https://abacatepay.com" + pay,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://lh3.googleusercontent.com https://d1w2poirtb3as9.cloudfront.net https://*.tile.openstreetmap.org https://www.facebook.com",
    // www.google.com também em connect-src (não só script-src): o próprio
    // script do reCAPTCHA faz uma chamada de rede pra /recaptcha/api2/clr,
    // sem isso ela quebrava silenciosamente por CSP (bug preexistente,
    // achado ao investigar por que o GA4 não carregava).
    "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://accounts.google.com https://oauth2.googleapis.com https://api.abacatepay.com https://viacep.com.br https://nominatim.openstreetmap.org https://www.thecolorapi.com https://tessdata.projectnaptha.com https://cdn.jsdelivr.net https://unpkg.com https://storage.googleapis.com https://*.ingest.us.sentry.io https://*.ingest.sentry.io https://www.google.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.facebook.com https://api.pwnedpasswords.com https://tiles.openfreemap.org https://tile.openstreetmap.org" + EMULATOR_CONNECT_SRC + pay,
    "frame-src https://www.google.com https://recaptcha.google.com https://accounts.google.com https://*.firebaseapp.com https://*.web.app" + pay,
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

  // Com a Cloudflare na frente (EDGE_SHARED_SECRET configurado), só aceita o
  // que passou por ela: quem chamasse o endereço do App Hosting direto
  // pularia o firewall, o anti-bot e o limite de DDoS da Cloudflare. Sem o
  // segredo configurado, nada muda.
  if (process.env.EDGE_SHARED_SECRET && !cameThroughEdge(req.headers)) {
    return new NextResponse('Forbidden', { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }

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
    // Mesma regra do getClientIp (lib/ip.ts): Cloudflare comprovada >
    // x-fah-client-ip do App Hosting > x-forwarded-for só no ambiente local.
    const ip = clientIpFromHeaders(req.headers);

    const active = await getMaintenanceStatus(projectId);

    if (active) {
      // ID do documento = HMAC do IP (ver lib/maintenanceQueue.ts).
      const docId = await maintenanceDocId(ip, process.env.STAFF_SESSION_SECRET);
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
          // A fila não é mais preenchida aqui: cada requisição de qualquer
          // IP (inclusive robô com user-agent de navegador) virava uma
          // entrada. Quem entra na fila agora é o navegador que abre
          // /manutencao e fica nela (ver /api/maintenance/queue). O caminho
          // pedido vai junto, sem query string (links de e-mail têm token).
          const target = new URL('/manutencao', req.url);
          const wanted = pathOnly(pathname);
          if (wanted && wanted !== '/' && !wanted.startsWith('/manutencao')) target.searchParams.set('de', wanted);
          const redirectRes = NextResponse.redirect(target);
          redirectRes.headers.set('Cache-Control', 'no-store, must-revalidate');
          applySecurityHeaders(redirectRes, pathname);
          return redirectRes;
        }
      }
    }
  }

  const res = NextResponse.next();
  applySecurityHeaders(res, pathname);

  // Páginas do painel e auth: nunca cachear (dados do usuário)
  // Páginas da loja: deixar o Next.js/CDN cachearem normalmente via ISR
  // O middleware já garantiu que manutenção ativa redireciona antes de chegar aqui
  if (
    pathname.startsWith('/painel') ||
    // /api/maintenance/status define o próprio cache (público quando não há manutenção).
    (pathname.startsWith('/api/') && pathname !== '/api/maintenance/status') ||
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
  // Arquivos estáticos (imagens, robots, sitemap) não passam pelo proxy:
  // cada um custava uma execução e, sem cache, uma leitura do Firestore.
  matcher: ['/((?!_next/static|_next/image|favicon|logo|public|icons|manifest|brand/|.*\\.(?:jpg|jpeg|png|webp|avif|svg|ico|gif|txt|xml|webmanifest|woff2?)$).*)'],
};
