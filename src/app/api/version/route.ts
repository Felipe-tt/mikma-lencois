import { NextResponse } from 'next/server';

// Versão do build que está no ar (ver BUILD_VERSION no next.config). Só é
// chamada quando dá erro de JS no navegador, para saber se é código velho.
export function GET() {
  return NextResponse.json(
    { version: process.env.NEXT_PUBLIC_BUILD_VERSION ?? '' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
