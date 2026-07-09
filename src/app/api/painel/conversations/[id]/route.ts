export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';

interface Params { params: Promise<{ id: string }> }

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;

  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;

  let role: string | undefined;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    role = decoded.role as string | undefined;
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }

  // Somente seller ou admin podem excluir conversas
  if (role !== 'seller' && role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  // Rate limit: 30 exclusões por hora por usuário
  const key = `delete-conversation:${bearer.token.slice(-8)}`;
  if (!rateLimit(key, 30, 60 * 60 * 1000)) {
    const retryAfter = Math.ceil(rateLimitRetryAfter(key) / 1000);
    return NextResponse.json({ error: 'Muitas tentativas.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  }

  const convRef = adminDb.collection('conversations').doc(id);
  const convSnap = await convRef.get();
  if (!convSnap.exists) {
    return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });
  }

  // Apaga a subcoleção messages em lotes de 500 (limite do batch do Firestore)
  const BATCH_SIZE = 500;
  let deletedMessages = 0;
  for (;;) {
    const msgsSnap = await convRef.collection('messages').limit(BATCH_SIZE).get();
    if (msgsSnap.empty) break;
    const batch = adminDb.batch();
    msgsSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    deletedMessages += msgsSnap.size;
    if (msgsSnap.size < BATCH_SIZE) break;
  }

  await convRef.delete();

  return NextResponse.json({ deleted: true, deletedMessages });
}
