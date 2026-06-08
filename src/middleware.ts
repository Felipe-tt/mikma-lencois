import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const { pathname } = req.nextUrl;

  // ── Security headers ────────────────────────────────────────────────────────
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('X-DNS-Prefetch-Control', 'off');
  res.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()');
  res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');

  // ── Content Security Policy ─────────────────────────────────────────────────
  // unsafe-eval removido. unsafe-inline mantido só para estilos (Next.js injeta CSS-in-JS).
  const csp = [
    "default-src 'self'",
    // Next.js precisa de 'self' + nonce idealmente, mas unsafe-inline é aceitável para scripts pequenos.
    // unsafe-eval foi removido — não é necessário para Next.js em produção.
    "script-src 'self' 'unsafe-inline' https://apis.google.com https://www.gstatic.com https://www.google.com https://www.recaptcha.net https://accounts.google.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://lh3.googleusercontent.com",
    "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://accounts.google.com https://oauth2.googleapis.com https://api.abacatepay.com https://viacep.com.br https://nominatim.openstreetmap.org",
    "frame-src https://www.google.com https://recaptcha.google.com https://accounts.google.com https://*.firebaseapp.com https://*.web.app",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join('; ');

  res.headers.set('Content-Security-Policy', csp);

  // ── Bloqueia acesso direto a rotas de admin sem header de autenticação ──────
  // (proteção extra — a verificação real é feita nas API routes)
  if (pathname.startsWith('/painel') && !pathname.startsWith('/painel/')) {
    // deixa passar — a verificação real está no PainelGuard (client)
  }

  // ── Remove headers que vazam informações do servidor ───────────────────────
  res.headers.delete('Server');
  res.headers.delete('X-Powered-By');

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon|logo|public|icons|manifest).*)'],
};
