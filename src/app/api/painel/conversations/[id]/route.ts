import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { effectiveRole } from '@/lib/staffMfa';
import { deleteConversation } from '@/lib/email/deleteConversation';
import { storageFiles } from '@/lib/storageFiles';

interface Params { params: Promise<{ id: string }> }

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;

  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;

  let role: string | undefined;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    role = effectiveRole(decoded);
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }

  // Somente seller ou admin podem excluir conversas
  if (role !== 'seller' && role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  // Rate limit: 30 exclusões por hora por usuário
  const key = `delete-conversation:${bearer.token.slice(-8)}`;
  if (!await rateLimit(key, 30, 60 * 60 * 1000)) {
    const retryAfter = Math.ceil(rateLimitRetryAfter(key) / 1000);
    return NextResponse.json({ error: 'Muitas tentativas.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  }

  const convRef = adminDb.collection('conversations').doc(id);
  const convSnap = await convRef.get();
  if (!convSnap.exists) {
    return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });
  }

  // Mensagens e anexos do cliente no Storage (antes os anexos ficavam).
  const deletedMessages = await deleteConversation(adminDb, storageFiles(), convRef);

  return NextResponse.json({ deleted: true, deletedMessages });
}
