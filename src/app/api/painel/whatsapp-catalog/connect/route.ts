export const dynamic = 'force-dynamic';
export const maxDuration = 110; // segundos — espera o QR ser escaneado (ver firebase.json: timeoutSeconds 120)

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, tooManyRequests } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { connectAndWait } from '@/lib/whatsapp/catalogClient';

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { roles: ['seller', 'admin'] });
  if (!auth.ok) return auth.response;

  // Cada tentativa pode levar quase 2 minutos e abre uma sessão de
  // WhatsApp — limite generoso mas real, evita abuso.
  const key = `whatsapp-catalog:connect:${auth.decoded.uid}`;
  if (!rateLimit(key, 8, 60 * 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(key));
  }

  try {
    const sock = await connectAndWait(95_000);
    // Não precisamos manter a conexão aberta agora — a sessão já foi
    // salva no Firestore. As próximas chamadas (buscar produtos, importar)
    // reconectam usando essa sessão, normalmente em 1-2s, sem QR.
    try {
      sock.end(undefined);
    } catch {
      /* ignora */
    }
    return NextResponse.json({ connected: true });
  } catch (err) {
    const reason = (err as { reason?: string })?.reason ?? 'error';
    const message =
      reason === 'timeout'
        ? 'Tempo esgotado esperando a leitura do QR code. Tente de novo.'
        : reason === 'logged_out'
        ? 'A sessão do WhatsApp foi desconectada. Tente conectar de novo.'
        : 'Não foi possível conectar ao WhatsApp agora. Tente de novo em alguns instantes.';
    return NextResponse.json({ connected: false, reason, error: message }, { status: 200 });
  }
}
