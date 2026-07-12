export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { extractBearer, tooManyRequests, validateBody } from '@/lib/security';
import { rateLimit, rateLimitRetryAfter } from '@/lib/rateLimit';
import { z } from 'zod';

export const maintenanceActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('toggle') }),
  z.object({ action: z.literal('release'), ip: z.string().min(1).max(45) }),
  z.object({ action: z.literal('release_all') }),
  z.object({ action: z.literal('clear_queue') }),
]);

// Validação simples de IPv4/IPv6 — evita que um valor arbitrário em
// body.ip vire parte de um ID de documento no Firestore sem checagem
// (o .replace(/[.:]/g,'_') sozinho não neutraliza "/", por exemplo).
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^[0-9a-fA-F:]+$/;
function isValidIp(ip: string): boolean {
  if (typeof ip !== 'string' || ip.length === 0 || ip.length > 45) return false;
  if (IPV4_RE.test(ip)) return ip.split('.').every(n => Number(n) <= 255);
  return ip.includes(':') && IPV6_RE.test(ip);
}

async function verifySeller(req: NextRequest) {
  const result = extractBearer(req);
  if ('response' in result) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(result.token, true);
    if (decoded.role !== 'seller' && decoded.role !== 'admin') return null;
    return decoded;
  } catch { return null; }
}

// GET — retorna status atual + queue
export async function GET(req: NextRequest) {
  const user = await verifySeller(req);
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const snap = await adminDb.doc('maintenance/status').get();
  const status = snap.exists ? snap.data() : { active: false };

  const queueSnap = await adminDb.collection('maintenance_queue')
    .orderBy('enteredAt', 'desc').limit(200).get();

  const queue = queueSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  return NextResponse.json({ status, queue });
}

// POST — toggle manutenção ou liberar IP
export async function POST(req: NextRequest) {
  const user = await verifySeller(req);
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  if (!rateLimit(`maintenance:${user.uid}`, 30, 60 * 1000)) {
    return tooManyRequests(rateLimitRetryAfter(`maintenance:${user.uid}`));
  }

  const parsedBody = await validateBody(req, maintenanceActionSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;

  // toggle manutenção
  if (body.action === 'toggle') {
    const snap = await adminDb.doc('maintenance/status').get();
    const current = snap.exists ? (snap.data()?.active ?? false) : false;
    await adminDb.doc('maintenance/status').set({
      active: !current,
      updatedAt: new Date().toISOString(),
      updatedBy: user.email ?? user.uid,
    }, { merge: true });

    // CRÍTICO: purga o cache ISR de todas as páginas.
    // Sem isso, páginas já cacheadas pela CDN do Firebase Hosting
    // (homepage 15min, produtos 10min, sobre/termos/privacidade 24h)
    // continuam sendo servidas direto da CDN sem nunca invocar o
    // Cloud Run — e é lá que este middleware checa a manutenção.
    // Resultado sem isso: toggle fica "ativo" no Firestore mas o
    // visitante continua vendo o site normal até o cache expirar.
    revalidatePath('/', 'layout');

    return NextResponse.json({ active: !current });
  }

  // liberar IP específico
  if (body.action === 'release' && body.ip) {
    if (!isValidIp(body.ip)) {
      return NextResponse.json({ error: 'IP inválido' }, { status: 400 });
    }
    // Precisa bater EXATAMENTE com a regex usada em src/middleware.ts
    // (substitui '.' E ':'  — IPv6 tem ':', então usar [./] aqui fazia o
    // release nunca encontrar o documento certo pra IPs IPv6).
    await adminDb.collection('maintenance_queue').doc(body.ip.replace(/[.:]/g, '_')).set({
      ip: body.ip,
      released: true,
      releasedAt: new Date().toISOString(),
      releasedBy: user.email ?? user.uid,
    }, { merge: true });
    return NextResponse.json({ ok: true });
  }

  // liberar todos
  if (body.action === 'release_all') {
    const queueSnap = await adminDb.collection('maintenance_queue').get();
    const batch = adminDb.batch();
    queueSnap.docs.forEach(d => batch.update(d.ref, {
      released: true,
      releasedAt: new Date().toISOString(),
      releasedBy: user.email ?? user.uid,
    }));
    await batch.commit();
    return NextResponse.json({ ok: true });
  }

  // limpar queue
  if (body.action === 'clear_queue') {
    const queueSnap = await adminDb.collection('maintenance_queue').get();
    const batch = adminDb.batch();
    queueSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
}
