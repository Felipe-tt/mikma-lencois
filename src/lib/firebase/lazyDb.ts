/**
 * Firestore sob demanda, pro que roda em toda página (cabeçalho,
 * favoritos, busca): o SDK só baixa quando alguém logado precisa dele
 * ou quando a pessoa começa a buscar.
 */
let pending: Promise<typeof import('firebase/firestore') & { db: import('firebase/firestore').Firestore }> | null = null;

export function loadFirestore() {
  pending ??= Promise.all([import('firebase/firestore'), import('@/lib/firebase/db')])
    .then(([fs, { db }]) => ({ ...fs, db }))
    .catch(e => { pending = null; throw e; });
  return pending;
}

/** onSnapshot de um documento, assinado depois que o SDK carrega. Devolve o cancelamento. */
export function watchDoc<T>(path: [string, string], onData: (data: T | undefined) => void, onError?: () => void): () => void {
  let unsub: (() => void) | undefined;
  let alive = true;
  loadFirestore().then(({ db, doc, onSnapshot }) => {
    if (alive) unsub = onSnapshot(doc(db, ...path), snap => onData(snap.data() as T | undefined), () => onError?.());
  }).catch(() => onError?.());
  return () => { alive = false; unsub?.(); };
}
