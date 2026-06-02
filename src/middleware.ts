import { NextRequest, NextResponse } from 'next/server';

// Routes that require authentication
const AUTH_REQUIRED = ['/checkout', '/perfil', '/conta'];
// Routes that require seller or admin role (checked server-side via custom claims)
const SELLER_REQUIRED = ['/painel'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Check for Firebase session cookie or token in cookie
  const session = req.cookies.get('__session')?.value ?? req.cookies.get('session')?.value;

  const requiresAuth = AUTH_REQUIRED.some(p => pathname.startsWith(p));
  const requiresSeller = SELLER_REQUIRED.some(p => pathname.startsWith(p));

  if ((requiresAuth || requiresSeller) && !session) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/checkout/:path*', '/perfil/:path*', '/conta/:path*', '/painel/:path*'],
};
