import { NextRequest, NextResponse } from 'next/server';

// Lê o status de manutenção via Firestore REST API
// (middleware roda no Edge Runtime — não pode usar Firebase Admin SDK)
async function getMaintenanceStatus(projectId: string) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/maintenance/status`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), cache: 'no-store' });
    if (!res.ok) return { active: false };
    const data = await res.json();
    const active = data?.fields?.active?.booleanValue ?? false;
    return { active };
  } catch {
    return { active: false };
  }
}

async function isIpReleased(projectId: string, docId: string) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/maintenance_queue/${docId}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), cache: 'no-store' });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.fields?.released?.booleanValue ?? false;
  } catch {
    return false;
  }
}

async function registerInQueue(projectId: string, docId: string, ip: string, uid?: string, email?: string, displayName?: string) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/maintenance_queue/${docId}`;
  const fields: Record<string, unknown> = {
    ip: { stringValue: ip },
    released: { booleanValue: false },
    enteredAt: { stringValue: new Date().toISOString() },
  };
  if (uid) fields.uid = { stringValue: uid };
  if (email) fields.email = { stringValue: email };
  if (displayName) fields.displayName = { stringValue: displayName };

  try {
    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
      signal: AbortSignal.timeout(4000),
    });
  } catch { /* silencioso */ }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Manutenção ────────────────────────────────────────────────────────────
  const isExempt =
    pathname.startsWith('/painel') ||
    pathname.startsWith('/api/') ||
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
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      '0.0.0.0';

    const { active } = await getMaintenanceStatus(projectId);

    if (active) {
      const docId = ip.replace(/[.:]/g, '_');
      const released = await isIpReleased(projectId, docId);

      if (!released) {
        // registra IP na queue (fire-and-forget)
        registerInQueue(projectId, docId, ip);
        const redirectRes = NextResponse.redirect(new URL('/manutencao', req.url));
        // Nunca cachear este redirect — senão ao desativar a manutenção,
        // visitantes continuariam travados na tela de manutenção pela CDN.
        redirectRes.headers.set('Cache-Control', 'no-store, must-revalidate');
        return redirectRes;
      }
    }
  }

  const res = NextResponse.next();

  // ── Security headers ──────────────────────────────────────────────────────
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('X-DNS-Prefetch-Control', 'off');
  res.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()');
  res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');

  // ── Content Security Policy ───────────────────────────────────────────────
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://apis.google.com https://www.gstatic.com https://www.google.com https://www.recaptcha.net https://accounts.google.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://lh3.googleusercontent.com",
    "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://accounts.google.com https://oauth2.googleapis.com https://api.abacatepay.com https://viacep.com.br https://nominatim.openstreetmap.org https://www.thecolorapi.com https://tessdata.projectnaptha.com https://cdn.jsdelivr.net https://unpkg.com",
    "frame-src https://www.google.com https://recaptcha.google.com https://accounts.google.com https://*.firebaseapp.com https://*.web.app",
    "worker-src 'self' blob: https://cdn.jsdelivr.net https://unpkg.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join('; ');

  res.headers.set('Content-Security-Policy', csp);
  res.headers.delete('Server');
  res.headers.delete('X-Powered-By');

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon|logo|public|icons|manifest).*)'],
};
