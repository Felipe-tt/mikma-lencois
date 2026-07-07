export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/lib/security';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

const saveSchema = z.object({
  token: z.string().min(20).max(4096),
});

const deleteSchema = z.object({
  token: z.string().min(20).max(4096),
});

// Só seller/admin podem se cadastrar para push — essa notificação é
// exclusivamente para o vendor, nunca para o comprador.
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { roles: ['seller', 'admin'] });
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 400 });
  }

  const { token } = parsed.data;
  const uid = auth.decoded.uid;

  // Remove tokens antigos do MESMO uid antes de salvar o novo. Sem isso,
  // cada vez que o vendor reativa (ex: depois de limpar dados do
  // navegador, trocar de aba, etc.) um token "zumbi" antigo pode continuar
  // válido por um tempo e receber a notificação em duplicidade junto com
  // o novo. Mantemos só o token mais recente por vendor.
  const staleTokensSnap = await adminDb
    .collection('pushTokens')
    .where('uid', '==', uid)
    .get();

  const batch = adminDb.batch();
  let hasStale = false;
  staleTokensSnap.docs.forEach((doc) => {
    if (doc.id !== token) {
      batch.delete(doc.ref);
      hasStale = true;
    }
  });
  if (hasStale) await batch.commit();

  // Um documento por token (não por uid) — o mesmo vendor pode ter o token
  // trocado ao reinstalar/limpar o navegador; guardamos por token para
  // permitir múltiplos dispositivos por vendor sem duplicar envio.
  await adminDb.collection('pushTokens').doc(token).set({
    uid,
    role: (auth.decoded as { role?: string }).role ?? 'seller',
    token,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return NextResponse.json({ ok: true });
}

// Remove o token (usado quando o vendor desativa notificações ou faz logout)
export async function DELETE(req: NextRequest) {
  const auth = await verifyAuth(req, { roles: ['seller', 'admin'] });
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 400 });
  }

  const doc = await adminDb.collection('pushTokens').doc(parsed.data.token).get();
  // Só permite apagar o próprio token — não deixa um vendor apagar o
  // token de outro vendor por engano/mal-intencionado.
  if (doc.exists && doc.data()?.uid === auth.decoded.uid) {
    await doc.ref.delete();
  }

  return NextResponse.json({ ok: true });
}
