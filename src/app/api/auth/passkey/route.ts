import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/security';
import { listPasskeys, removePasskey, summarize } from '@/lib/passkeys';

/** Passkeys da conta logada (perfil). */
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;
  const list = await listPasskeys(auth.decoded.uid);
  return NextResponse.json({ passkeys: list.map(p => summarize(p.id, p)) }, { headers: { 'Cache-Control': 'no-store' } });
}

/** Remove uma passkey da conta (?id=). */
export async function DELETE(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;
  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!/^[A-Za-z0-9_-]{16,1400}$/.test(id)) return NextResponse.json({ error: 'Passkey inválida' }, { status: 400 });
  const ok = await removePasskey(auth.decoded.uid, id);
  if (!ok) return NextResponse.json({ error: 'Passkey não encontrada' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
