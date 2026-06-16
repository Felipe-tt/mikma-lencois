export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBearer } from '@/lib/security';

export async function DELETE(req: NextRequest) {
  // Verificar autenticação
  const bearer = extractBearer(req);
  if ('response' in bearer) return bearer.response;

  let role: string | undefined;
  try {
    const decoded = await adminAuth.verifyIdToken(bearer.token, true);
    role = decoded.role as string | undefined;
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }

  // Somente seller ou admin podem excluir pedidos
  if (role !== 'seller' && role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  // Buscar todos os pedidos cancelados
  const snap = await adminDb
    .collection('orders')
    .where('status', '==', 'cancelled')
    .get();

  if (snap.empty) {
    return NextResponse.json({ deleted: 0 });
  }

  // Firestore batch suporta até 500 operações por vez
  const BATCH_SIZE = 500;
  const docs = snap.docs;
  let deleted = 0;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = adminDb.batch();
    docs.slice(i, i + BATCH_SIZE).forEach(d => batch.delete(d.ref));
    await batch.commit();
    deleted += Math.min(BATCH_SIZE, docs.length - i);
  }

  return NextResponse.json({ deleted });
}
