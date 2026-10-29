import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer, validateBody } from '@/lib/security';
import { rateLimit } from '@/lib/rateLimit';
import { getSettings } from '@/lib/settings';
import { nfeConfigFrom } from '@/lib/nfe/config';
import { CertificateError, certificateInfo, removeCertificate, saveCertificate } from '@/lib/nfe/certificate';
import { hasSecondFactor } from '@/lib/staffMfa';

/**
 * Certificado digital A1 da nota fiscal (só admin).
 * GET: dados do certificado importado (titular, CNPJ, validade) ou null.
 * POST: importa o .pfx (base64) com a senha. DELETE: remove.
 * O arquivo e a senha nunca voltam para o navegador.
 */
async function admin(req: NextRequest): Promise<{ uid: string } | NextResponse> {
  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    if ((decoded as { role?: string }).role !== 'admin' || !hasSecondFactor(decoded)) return NextResponse.json({ error: 'Só administradores' }, { status: 403 });
    return { uid: decoded.uid };
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }
}

export async function GET(req: NextRequest) {
  const who = await admin(req);
  if (who instanceof NextResponse) return who;
  return NextResponse.json({ certificate: await certificateInfo() });
}

// .pfx de A1 tem poucos KB; 100 KB em base64 cobre com folga.
const bodySchema = z.object({
  pfxBase64: z.string().min(100).max(140_000).regex(/^[A-Za-z0-9+/=]+$/),
  password: z.string().min(1).max(200),
});

export async function POST(req: NextRequest) {
  const who = await admin(req);
  if (who instanceof NextResponse) return who;
  if (!await rateLimit(`nfe-cert:${who.uid}`, 10, 60 * 60_000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde um pouco.' }, { status: 429 });
  }
  const parsed = await validateBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  try {
    const config = nfeConfigFrom(await getSettings() as unknown as Record<string, unknown>);
    const info = await saveCertificate(Buffer.from(parsed.data.pfxBase64, 'base64'), parsed.data.password, config.cnpj);
    // Só a validade vai para as settings (públicas): o painel sabe que há certificado.
    await adminDb.collection('settings').doc('store').set({ nfeCertificado: { validTo: info.validTo } }, { merge: true });
    return NextResponse.json({ certificate: info });
  } catch (err) {
    if (err instanceof CertificateError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

export async function DELETE(req: NextRequest) {
  const who = await admin(req);
  if (who instanceof NextResponse) return who;
  await removeCertificate();
  await adminDb.collection('settings').doc('store').set({ nfeCertificado: FieldValue.delete() }, { merge: true });
  return NextResponse.json({ certificate: null });
}
