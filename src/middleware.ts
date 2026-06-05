import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // ── Security headers ─────────────────────────────────────────────────────
  // Prevent clickjacking
  res.headers.set('X-Frame-Options', 'DENY');
  // Prevent MIME sniffing
  res.headers.set('X-Content-Type-Options', 'nosniff');
  // Referrer policy
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Permissions policy — disable unnecessary browser features
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  // Content Security Policy
  res.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.gstatic.com https://www.google.com https://www.recaptcha.net",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://lh3.googleusercontent.com",
      "font-src 'self' data:",
      "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://api.abacatepay.com https://viacep.com.br",
      "frame-src https://www.google.com https://recaptcha.google.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );

  return res;
}

export const config = {
  matcher: [
    // Apply to all routes except static files and Next internals
    '/((?!_next/static|_next/image|favicon|logo|public).*)',
  ],
};
