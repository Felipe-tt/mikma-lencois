import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getClientIp, verifyAuth } from '@/lib/security';
import { readPii } from '@/lib/piiCrypto';
import { rateLimit } from '@/lib/rateLimit';
import { notifyPiiScan } from '@/lib/staffDevices';

const HOUR = 60 * 60 * 1000;
/** O painel abre um por pedido visto; passar disso numa hora é varredura. */
const PII_VIEWS_PER_HOUR = 120;

/**
 * CPF e telefone de um cliente, para a equipe (página do pedido e etiqueta).
 * Ficam criptografados no banco (ver lib/piiCrypto.ts). Cada abertura fica
 * registrada (piiAccessLog, só o servidor lê) e há um teto por hora: uma
 * conta da equipe invadida não baixa o CPF de todos os clientes em silêncio.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const auth = await verifyAuth(req, { roles: ['seller', 'admin'] });
  if (!auth.ok) return auth.response;
  const { uid } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) return NextResponse.json({ error: 'Cliente inválido' }, { status: 400 });

  const viewer = auth.decoded.uid;
  if (!await rateLimit(`pii-view:${viewer}`, PII_VIEWS_PER_HOUR, HOUR)) {
    // Um aviso por hora para os admins (e para a própria pessoa).
    if (await rateLimit(`pii-view-alert:${viewer}`, 1, HOUR)) {
      await notifyPiiScan({ uid: viewer, email: auth.decoded.email, ip: getClientIp(req), perHour: PII_VIEWS_PER_HOUR })
        .catch(err => console.error('[pii] alerta falhou:', err));
    }
    return NextResponse.json({ error: 'Muitas consultas de CPF e telefone em pouco tempo. Tente de novo mais tarde.' }, { status: 429 });
  }

  const snap = await adminDb.collection('users').doc(uid).get();
  if (!snap.exists) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
  // Quem da equipe abriu o CPF e o telefone de quem, e quando (LGPD, art. 37).
  // Sem o registro, não abre.
  await adminDb.collection('piiAccessLog').add({ by: viewer, customer: uid, at: new Date().toISOString() });
  return NextResponse.json(readPii(snap.data()), { headers: { 'Cache-Control': 'private, no-store' } });
}
