/**
 * Ordem do menu do painel escolhida pela pessoa (segurar 2s e arrastar).
 * Guarda só os hrefs; item novo (que ainda não estava salvo) entra na
 * posição padrão, e item que saiu do menu some da lista salva.
 */
export function applyNavOrder<T extends { href: string }>(items: readonly T[], order: readonly string[] | null | undefined): T[] {
  if (!order?.length) return [...items];
  const byHref = new Map(items.map(i => [i.href, i]));
  const saved = order.filter(h => byHref.has(h)).map(h => byHref.get(h)!);
  const savedSet = new Set(saved.map(i => i.href));
  const result = [...saved];
  items.forEach((item, idx) => {
    if (!savedSet.has(item.href)) result.splice(Math.min(idx, result.length), 0, item);
  });
  return result;
}

/** Move o item de `from` para `to` (índices), sem mudar a lista original. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}
