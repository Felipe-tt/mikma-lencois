/**
 * "Escolhas da semana" da home: variadas em vez dos 8 mais novos (que podiam
 * ser todos fronhas, se foi o que entrou por último).
 * - Alterna as categorias, na ordem de quem compra (jogo, lençol, fronha...).
 * - Fronha é complemento: no máximo 2.
 * - Dentro da categoria, alterna os tamanhos (solteiro, casal, queen, king).
 * - Muda a cada semana, mas fica igual durante a semana (mesma semente).
 */

const CAT_ORDER = ['Jogos de cama', 'Lençóis', 'Fronhas'];
const CAP: Record<string, number> = { Fronhas: 2 };

/** Número da semana desde 1970, contado a partir de segunda-feira. */
export function weekSeed(now: Date = new Date()): number {
  return Math.floor((now.getTime() / 86_400_000 + 3) / 7);
}

/** Embaralha de forma estável a partir da semente (mulberry32). */
function shuffled<T>(items: T[], seed: number): T[] {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** O mínimo que a vitrine precisa de um produto. */
interface Pickable { category?: string; variants?: Array<{ size?: string }> }

const sizeOf = (p: Pickable) => p.variants?.[0]?.size ?? '';

/** Uma categoria em ordem de vitrine: tamanhos alternados, sorteio da semana em cada um. */
function bySizeRoundRobin<T extends Pickable>(items: T[], seed: number): T[] {
  const groups = new Map<string, T[]>();
  for (const p of items) {
    const k = sizeOf(p);
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const queues = shuffled([...groups.keys()].sort(), seed).map(k => shuffled(groups.get(k)!, seed + k.length));
  const out: T[] = [];
  while (queues.some(q => q.length)) for (const q of queues) { const p = q.shift(); if (p) out.push(p); }
  return out;
}

export function pickFeatured<T extends Pickable>(all: T[], count = 8, seed = weekSeed()): T[] {
  if (all.length <= count) return all;
  // Só olha os mais recentes de cada categoria (o catálogo vem do mais novo):
  // a vitrine mostra novidade, sem ressuscitar peça antiga toda semana.
  const cats = new Map<string, T[]>();
  for (const p of all) {
    const c = p.category || 'Outros';
    const list = cats.get(c) ?? [];
    if (list.length < 24) list.push(p);
    cats.set(c, list);
  }
  const order = [...cats.keys()].sort((a, b) => {
    const ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  const queues = order.map(c => ({ c, q: bySizeRoundRobin(cats.get(c)!, seed), taken: 0 }));
  const out: T[] = [];
  while (out.length < count) {
    let added = false;
    for (const lane of queues) {
      if (out.length >= count) break;
      if (lane.taken >= (CAP[lane.c] ?? Infinity) || !lane.q.length) continue;
      out.push(lane.q.shift()!);
      lane.taken++;
      added = true;
    }
    if (!added) break;
  }
  // Faltou (só fronhas no catálogo, por exemplo): completa com o que sobrou.
  if (out.length < count) {
    const rest = all.filter(p => !out.includes(p));
    out.push(...rest.slice(0, count - out.length));
  }
  return out;
}
