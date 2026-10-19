/**
 * Compra que um visitante começou antes de entrar na conta ("Adicionar" ou
 * "Comprar agora" sem login). Fica no localStorage, não no sessionStorage:
 * quem cria conta confirma o e-mail num link que abre outra aba (ou o
 * navegador do app de e-mail), e lá o sessionStorage está vazio. Antes o
 * produto se perdia nesse caminho e a pessoa caía na home com o carrinho
 * vazio.
 */
export interface PendingPurchase {
  productId: string;
  variantId: string;
  qty: number;
  action: 'cart' | 'buy';
  returnTo: string;
  at: number;
}

const KEY = 'mikma_pending_purchase';
const TTL_MS = 60 * 60 * 1000; // 1h: depois disso a intenção já não vale

export function savePendingPurchase(p: Omit<PendingPurchase, 'at'>) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...p, at: Date.now() })); } catch { /* storage indisponível */ }
}

export function readPendingPurchase(): PendingPurchase | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingPurchase;
    if (!p?.productId || !p.variantId || Date.now() - p.at > TTL_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

export function clearPendingPurchase() {
  try { localStorage.removeItem(KEY); } catch { /* storage indisponível */ }
}
