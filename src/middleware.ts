import { NextRequest, NextResponse } from 'next/server';

// Rotas que exigem autenticação verificada client-side
// O middleware apenas deixa passar — proteção de role fica nas páginas
const PROTECTED = ['/checkout', '/perfil', '/conta', '/pedidos', '/painel'];

export function middleware(req: NextRequest) {
  // Sem verificação de cookie — Firebase Auth é client-side (Google login)
  // As páginas protegidas fazem redirect via useAuth hook
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
