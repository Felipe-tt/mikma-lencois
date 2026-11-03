import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyAuth } from '@/lib/security';
import { readPii } from '@/lib/piiCrypto';

/**
 * CPF e telefone de um cliente, para a equipe (página do pedido e etiqueta).
 * Ficam criptografados no banco (ver lib/piiCrypto.ts).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const auth = await verifyAuth(req, { roles: ['seller', 'admin'] });
  if (!auth.ok) return auth.response;
  const { uid } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) return NextResponse.json({ error: 'Cliente inválido' }, { status: 400 });
  const snap = await adminDb.collection('users').doc(uid).get();
  if (!snap.exists) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
  return NextResponse.json(readPii(snap.data()), { headers: { 'Cache-Control': 'private, no-store' } });
}
