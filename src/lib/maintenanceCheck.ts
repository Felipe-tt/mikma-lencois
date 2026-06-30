import { unstable_noStore as noStore } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
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

type GeoResult = { city: string; region: string; country: string; isp: string; debugError: string };

async function lookupIpGeo(ip: string): Promise<GeoResult> {
  if (ip === '0.0.0.0' || ip.startsWith('127.') || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { city: '', region: '', country: '', isp: '', debugError: 'ip_local' };
  }

  // ipapi.co bloqueia/rate-limita IPs de cloud providers (GCP, AWS, Azure).
  // Tentamos múltiplas APIs em sequência — a primeira que responder com sucesso vence.
  // ip-api.com (HTTP) e freeipapi.com funcionam bem de cloud; ipapi.co fica por último.
  const attempts: Array<() => Promise<GeoResult | null>> = [
    // 1. ip-api.com — funciona de cloud, sem chave, 45 req/min grátis
    async () => {
      const res = await fetch(
        `http://ip-api.com/json/${ip}?fields=status,city,regionName,country,org`,
        { signal: AbortSignal.timeout(4000), cache: 'no-store' }
      );
      if (!res.ok) return null;
      const d = await res.json();
      if (d.status !== 'success') return null;
      return { city: d.city ?? '', region: d.regionName ?? '', country: d.country ?? '', isp: d.org ?? '', debugError: '' };
    },
    // 2. freeipapi.com — funciona de cloud, sem chave
    async () => {
      const res = await fetch(
        `https://freeipapi.com/api/json/${ip}`,
        { signal: AbortSignal.timeout(4000), cache: 'no-store' }
      );
      if (!res.ok) return null;
      const d = await res.json();
      if (!d.cityName) return null;
      return { city: d.cityName ?? '', region: d.regionName ?? '', country: d.countryName ?? '', isp: '', debugError: '' };
    },
    // 3. ipapi.co — fallback: funciona de IPs residenciais, mas bloqueia cloud
    async () => {
      const res = await fetch(
        `https://ipapi.co/${ip}/json/`,
        { signal: AbortSignal.timeout(4000), headers: { 'User-Agent': 'MikmaLencois/1.0' }, cache: 'no-store' }
      );
      if (!res.ok) return null;
      const d = await res.json();
      if (d.error) return null;
      return { city: d.city ?? '', region: d.region ?? '', country: d.country_name ?? '', isp: d.org ?? '', debugError: '' };
    },
  ];

  const errors: string[] = [];
  for (let i = 0; i < attempts.length; i++) {
    try {
      const result = await attempts[i]();
      if (result) return result;
      errors.push(`attempt_${i + 1}_no_data`);
    } catch (err) {
      errors.push(`attempt_${i + 1}_${err instanceof Error ? err.message.slice(0, 40) : 'err'}`);
    }
  }
  return { city: '', region: '', country: '', isp: '', debugError: errors.join('|') };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>(resolve => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function checkMaintenance(): Promise<void> {
  noStore();

  // This function runs on EVERY page load across the entire site. It must
  // never be able to hang the request — if Firestore itself is ever slow
  // or degraded, fail open (treat as not-in-maintenance) within a bounded
  // time rather than blocking every single visitor indefinitely.
  let active = false;
  try {
    const snap = await withTimeout(adminDb.doc('maintenance/status').get(), 3000, null);
    active = snap?.exists ? (snap.data()?.active ?? false) : false;
  } catch {
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
    const qSnap = await withTimeout(adminDb.doc(`maintenance_queue/${docId}`).get(), 3000, null);
    released = qSnap?.exists ? (qSnap.data()?.released ?? false) : false;
    alreadyRegistered = qSnap?.exists ?? false;
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
      geoCity: '',
      geoRegion: '',
      geoCountry: '',
      isp: '',
      geoDebug: 'pending',
    };
    if (uid) doc.uid = uid;
    if (email) doc.email = email;
    if (displayName) doc.displayName = displayName;

    const queueRef = adminDb.doc(`maintenance_queue/${docId}`);

    // Write immediately, with no geo data — never blocks the redirect below.
    queueRef.set(doc, { merge: true }).catch(() => {});

    // Enrich with geo data fully in the background. CRITICAL: this must never
    // block the redirect below. ipapi.co (and most free geo-IP APIs) routinely
    // rate-limit or outright block traffic from cloud provider IP ranges
    // (GCP/AWS/Azure), which made this hang or eat its full timeout on every
    // new visitor when this was awaited before the redirect — exactly what
    // caused the whole site (and /painel, sharing the same Cloud Run service)
    // to feel stuck.
    //
    // A bare unawaited promise (the previous approach here) doesn't actually
    // survive in this environment though: Cloud Run only keeps CPU allocated
    // to an instance while a request is in flight, so the moment this Server
    // Component's response (the redirect below) is sent, the instance can be
    // frozen mid-fetch — the lookupIpGeo() call never gets to finish, which is
    // exactly why every entry in the queue was stuck on "geo: pending"
    // forever, no matter how long it had been waiting. middleware.ts already
    // solves this correctly for its own (Edge Runtime) code path via
    // event.waitUntil(); after() is the Server Component / Route Handler
    // equivalent — it keeps this request alive just long enough to run the
    // callback after the response is sent, without delaying the redirect
    // itself. If it still never completes, the only cost is a missing
    // city/ISP label in the admin queue view — never a blocked visitor.
    after(async () => {
      const geo = await lookupIpGeo(ip);
      await queueRef.set(
        { geoCity: geo.city, geoRegion: geo.region, geoCountry: geo.country, isp: geo.isp, geoDebug: geo.debugError },
        { merge: true }
      ).catch(() => {});
    });
  }

  redirect('/manutencao');
}
