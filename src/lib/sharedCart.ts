import type { Firestore } from 'firebase-admin/firestore';
import type { CartItem, Product } from '@/types';
import { getFronhaCount } from '@/lib/fronhaSwap';

/**
 * Carrinho compartilhado ("Montar junto"): o dono gera um link secreto e
 * quem tiver o link mexe no carrinho dele em tempo real. O link aponta pra
 * sharedCarts/{token} → { uid, expiresAt }; o carrinho continua em
 * carts/{uid}, então o checkout do dono não muda. Quem tem o link só
 * escreve por /api/cart/shared/[token], que monta o item a partir do
 * produto no banco (preço, nome e foto nunca vêm do navegador).
 */
export const SHARE_DAYS = 7;
export const MAX_SHARED_LINES = 30;
export const MAX_SHARED_QTY = 20;
export const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;

export type SharedOp =
  | { op: 'add'; productId: string; variantId: string }
  | { op: 'qty'; line: string; quantity: number }
  | { op: 'swap'; line: string; swapSku: string | null };

export const lineKey = (i: Pick<CartItem, 'sku' | 'note'>) => (i.note ? `${i.sku}::${i.note}` : i.sku);

async function available(db: Firestore, sku: string): Promise<number> {
  const inv = (await db.collection('inventory').doc(sku).get()).data();
  return inv ? Math.max(0, (inv.quantity ?? 0) - (inv.reserved ?? 0)) : MAX_SHARED_QTY;
}

async function activeProduct(db: Firestore, id: string): Promise<Product | null> {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return null;
  const snap = await db.collection('products').doc(id).get();
  const p = snap.exists ? ({ id: snap.id, ...snap.data() } as Product) : null;
  return p && p.active !== false ? p : null;
}

/** Aplica uma alteração e devolve os itens novos e o texto do aviso. */
export async function applySharedOp(db: Firestore, items: CartItem[], o: SharedOp): Promise<{ items: CartItem[]; text: string } | { error: string }> {
  if (o.op === 'add') {
    const p = await activeProduct(db, o.productId);
    const variant = p?.variants?.find(v => v.id === o.variantId);
    if (!p || !variant) return { error: 'Produto indisponível.' };
    const sku = `${p.id}_${variant.id}`;
    const existing = items.find(i => lineKey(i) === sku);
    if (!existing && items.length >= MAX_SHARED_LINES) return { error: 'O carrinho já está cheio.' };
    const qty = (existing?.quantity ?? 0) + 1;
    if (qty > Math.min(MAX_SHARED_QTY, await available(db, sku))) return { error: 'Sem mais unidades em estoque.' };
    const item: CartItem = { productId: p.id, productName: p.name, sku, variant, quantity: qty, unitPrice: p.price, image: p.images?.[0] ?? '' };
    return {
      items: existing ? items.map(i => (lineKey(i) === sku ? { ...i, quantity: qty } : i)) : [...items, item],
      text: `adicionou ${p.name}`,
    };
  }

  const current = items.find(i => lineKey(i) === o.line);
  if (!current) return { error: 'Esse item já saiu do carrinho.' };

  if (o.op === 'qty') {
    if (!Number.isInteger(o.quantity) || o.quantity < 0 || o.quantity > MAX_SHARED_QTY) return { error: 'Quantidade inválida.' };
    if (o.quantity === 0) return { items: items.filter(i => i !== current), text: `tirou ${current.productName}` };
    if (o.quantity > current.quantity && o.quantity > await available(db, current.sku)) return { error: 'Sem mais unidades em estoque.' };
    return { items: items.map(i => (i === current ? { ...i, quantity: o.quantity } : i)), text: `mudou a quantidade de ${current.productName}` };
  }

  // Troca de fronha: só em Jogo de Cama, por uma Fronha ativa (mesma regra
  // de sanitizeSwaps, que o checkout ainda reaplica).
  const main = await activeProduct(db, current.productId);
  if (main?.category !== 'Jogos de cama') return { error: 'Esse item não tem troca de fronha.' };
  const { swapSku: _s, swapQtyPerUnit: _q, note: _n, ...base } = current;
  let next: CartItem = base;
  let text = `voltou a fronha padrão de ${current.productName}`;
  if (o.swapSku) {
    const [fid, vid] = o.swapSku.split('_');
    const fronha = await activeProduct(db, fid ?? '');
    if (fronha?.category !== 'Fronhas' || !fronha.variants?.some(v => v.id === vid)) return { error: 'Fronha indisponível.' };
    const perUnit = getFronhaCount({ fronhaCount: main.fronhaCount, variantSize: main.variants?.[0]?.size });
    if (current.quantity * perUnit > await available(db, o.swapSku)) return { error: 'Essa fronha está sem estoque.' };
    next = { ...base, note: `Fronha trocada: ${fronha.name}`, swapSku: o.swapSku, swapQtyPerUnit: perUnit };
    text = `trocou a fronha de ${current.productName}`;
  }
  // Se já existe uma linha igual, junta as quantidades.
  const twin = items.find(i => i !== current && lineKey(i) === lineKey(next));
  const merged = twin
    ? items.filter(i => i !== current).map(i => (i === twin ? { ...i, quantity: Math.min(MAX_SHARED_QTY, i.quantity + current.quantity) } : i))
    : items.map(i => (i === current ? next : i));
  return { items: merged, text };
}
