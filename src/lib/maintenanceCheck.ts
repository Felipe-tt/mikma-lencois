import { unstable_noStore as noStore } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { adminDb, adminAuth } from '@/lib/firebase/admin';

/**
 * Checks maintenance status and redirects to /manutencao if active
 * and the current visitor's IP hasn't been released.
 *
 * WHY THIS LIVES HERE INSTEAD OF RELYING ON MIDDLEWARE:
 * Firebase Hosting's Next.js framework support is explicitly labeled
 * "early preview... best-effort... breaking changes can be expected"
 * by Firebase itself when running `firebase deploy`. Edge Middleware
 * combined with ISR-cached pages is exactly the kind of interaction
 * that integration doesn't reliably support yet — a cached page can
 * be served straight from Firebase Hosting's CDN without the
 * underlying Cloud Run function (where middleware lives) ever being
 * invoked again until the cache entry expires.
 *
 * Server Components are a core, stable Next.js feature with none of
 * that ambiguity. Calling noStore() here explicitly opts this data
 * fetch out of any caching layer Next.js might otherwise apply.
 */

async function lookupIpGeo(ip: string): Promise<{ city: string; region: string; country: string; isp: string; debugError: string }> {
  if (ip === '0.0.0.0' || ip.startsWith('127.') || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { city: '', region: '', country: '', isp: '', debugError: 'ip_local' };
  }
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'MikmaLencois/1.0' },
      cache: 'no-store',
    });
    if (!res.ok) return { city: '', region: '', country: '', isp: '', debugError: `http_${res.status}` };
    const data = await res.json();
    if (data.error) return { city: '', region: '', country: '', isp: '', debugError: `api_error_${data.reason ?? 'unknown'}` };
    return {
      city: data.city ?? '',
      region: data.region ?? '',
      country: data.country_name ?? '',
      isp: data.org ?? '',
      debugError: '',
    };
  } catch (err) {
    return { city: '', region: '', country: '', isp: '', debugError: `exception_${err instanceof Error ? err.message : String(err)}`.slice(0, 200) };
  }
}

export async function checkMaintenance(): Promise<void> {
  noStore();

  let active = false;
  try {
    const snap = await adminDb.doc('maintenance/status').get();
    active = snap.exists ? (snap.data()?.active ?? false) : false;
  } catch {
    // If Firestore is unreachable, fail open — never lock visitors out
    // because of a transient infra error.
    return;
  }

  if (!active) return;

  const h = await headers();
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    '0.0.0.0';

  // Tenta identificar usuário logado via cookie de sessão do Firebase,
  // se existir. Se não houver, segue como visitante anônimo.
  let uid: string | undefined;
  let email: string | undefined;
  let displayName: string | undefined;
  let isSellerOrAdmin = false;

  const authHeader = h.get('authorization') ?? '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (bearerToken) {
    try {
      const decoded = await adminAuth.verifyIdToken(bearerToken);
      uid = decoded.uid;
      email = decoded.email ?? undefined;
      displayName = decoded.name ?? undefined;
      const role = (decoded as { role?: string }).role;
      isSellerOrAdmin = role === 'seller' || role === 'admin';
    } catch {
      // token inválido/ausente — trata como anônimo
    }
  }

  // Seller/admin nunca é bloqueado, em nenhuma página
  if (isSellerOrAdmin) return;

  const docId = uid ? `user_${uid}` : ip.replace(/[.:]/g, '_');

  let released = false;
  let alreadyRegistered = false;
  try {
    const qSnap = await adminDb.doc(`maintenance_queue/${docId}`).get();
    released = qSnap.exists ? (qSnap.data()?.released ?? false) : false;
    alreadyRegistered = qSnap.exists;
  } catch {
    released = false;
  }

  if (released) return;

  if (!alreadyRegistered) {
    // Coleta o máximo de informação possível sobre o visitante para
    // o seller poder identificar quem está esperando (cidade, ISP,
    // dispositivo, idioma, página que tentou acessar, etc).
    const userAgent = h.get('user-agent') ?? '';
    const referer = h.get('referer') ?? '';
    const acceptLanguage = h.get('accept-language') ?? '';
    const secChUa = h.get('sec-ch-ua') ?? '';
    const secChUaPlatform = (h.get('sec-ch-ua-platform') ?? '').replace(/"/g, '');
    const secChUaMobile = h.get('sec-ch-ua-mobile') ?? '';

    const geo = await lookupIpGeo(ip);

    const doc: Record<string, unknown> = {
      ip,
      released: false,
      enteredAt: new Date().toISOString(),
      userAgent,
      referer,
      acceptLanguage,
      secChUa,
      platform: secChUaPlatform,
      isMobile: secChUaMobile,
      geoCity: geo.city,
      geoRegion: geo.region,
      geoCountry: geo.country,
      isp: geo.isp,
      geoDebug: geo.debugError,
    };
    if (uid) doc.uid = uid;
    if (email) doc.email = email;
    if (displayName) doc.displayName = displayName;

    // Fire-and-forget: registra o visitante na fila para o seller ver.
    adminDb.doc(`maintenance_queue/${docId}`).set(doc, { merge: true }).catch(() => {});
  }

  redirect('/manutencao');
}
