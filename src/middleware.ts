import { NextRequest, NextResponse } from 'next/server';

// Rotas que exigem autenticação (qualquer usuário logado)
const AUTH_REQUIRED = ['/checkout', '/perfil', '/conta', '/pedidos'];
// Rotas que exigem papel seller ou admin
const SELLER_REQUIRED = ['/painel'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const session =
    req.cookies.get('__session')?.value ?? req.cookies.get('session')?.value;

  const requiresAuth = AUTH_REQUIRED.some((p) => pathname.startsWith(p));
  const requiresSeller = SELLER_REQUIRED.some((p) => pathname.startsWith(p));

  if ((requiresAuth || requiresSeller) && !session) {
    const loginUrl = new URL('/entrar', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/checkout/:path*',
    '/perfil/:path*',
    '/conta/:path*',
    '/pedidos/:path*',
    '/painel/:path*',
  ],
};
