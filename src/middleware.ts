import { NextRequest, NextResponse } from 'next/server';

// Fix MaxListenersExceededWarning from Firebase Admin / Next.js
if (typeof process !== 'undefined') {
  process.setMaxListeners(25);
}

export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.gstatic.com https://www.google.com https://www.recaptcha.net https://accounts.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://lh3.googleusercontent.com",
      // connect-src: Firebase services + Google OAuth token endpoint + GIS
      "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://accounts.google.com https://oauth2.googleapis.com https://api.abacatepay.com https://viacep.com.br",
      // frame-src: Google OAuth popup + Firebase auth iframe (*.web.app + *.firebaseapp.com)
      "frame-src https://www.google.com https://recaptcha.google.com https://accounts.google.com https://*.firebaseapp.com https://*.web.app",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );

  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon|logo|public).*)',
  ],
};
