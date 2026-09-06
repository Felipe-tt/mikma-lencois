export type StockUrgencyLevel = 'critical' | 'warning' | null;

export interface StockUrgency {
  text: string;
  level: StockUrgencyLevel;
}

/**
 * Mensagem de urgência de estoque, em graus — quanto menor a
 * quantidade, mais direta a mensagem. Usada tanto na página do produto
 * (BuyBox) quanto no carrinho, pra manter o mesmo tom em todo o site.
 *
 * available <= 0  → null (a tela já trata "fora de estoque" separado,
 *                    esse helper é só pra quando ainda dá pra comprar)
 * available === 1 → "Última unidade disponível!" (singular certo, sem
 *                    o "Últimas 1 unidades" que soa errado)
 * available <= 3  → "Só restam N unidades!" (bem pouco, ainda mais urgente
 *                    que o aviso genérico de estoque baixo)
 * available <= 5  → "Apenas N unidades disponíveis" (aviso padrão)
 * available > 5   → null (estoque confortável, não precisa de aviso)
 */
export function getStockUrgency(available: number): StockUrgency | null {
  if (available <= 0) return null;
  if (available === 1) return { text: 'Última unidade disponível!', level: 'critical' };
  if (available <= 3) return { text: `Só restam ${available} unidades!`, level: 'critical' };
  if (available <= 5) return { text: `Apenas ${available} unidades disponíveis`, level: 'warning' };
  return null;
}
