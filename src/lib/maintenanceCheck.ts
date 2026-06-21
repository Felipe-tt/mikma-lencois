import { unstable_noStore as noStore } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { adminDb } from '@/lib/firebase/admin';

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
 * fetch out of any caching layer Next.js might otherwise apply, and
 * calling it from a layout (combined with `export const dynamic =
 * 'force-dynamic'` on that layout) forces the entire route subtree to
 * render fresh, server-side, on every single request — guaranteed to
 * run inside the Cloud Run function every time, with zero dependency
 * on Middleware execution semantics or ISR/CDN cache behavior.
 */
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

  const docId = ip.replace(/[.:]/g, '_');

  let released = false;
  try {
    const qSnap = await adminDb.doc(`maintenance_queue/${docId}`).get();
    released = qSnap.exists ? (qSnap.data()?.released ?? false) : false;
  } catch {
    released = false;
  }

  if (released) return;

  // Fire-and-forget: register this visitor's IP in the queue so the
  // seller can see who's waiting and release them manually if needed.
  adminDb
    .doc(`maintenance_queue/${docId}`)
    .set(
      { ip, released: false, enteredAt: new Date().toISOString() },
      { merge: true }
    )
    .catch(() => {});

  redirect('/manutencao');
}
