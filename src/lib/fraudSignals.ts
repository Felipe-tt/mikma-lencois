import type { Address, Order } from '@/types';

// Sinais de fraude leve, pensados pra loja pequena: nenhum bloqueia o
// pedido automaticamente (falso positivo custa caro pra loja pequena
// perder venda boa), só sinaliza no painel pra o vendedor decidir com
// mais informação antes de despachar. Nunca visível pro cliente.

export interface FraudSignal {
  reason: string;
  relatedOrderIds: string[];
}

// Normaliza endereço pra comparação: mesmo endereço com grafia levemente
// diferente (maiúscula, espaço extra) ainda deve contar como o mesmo.
export function normalizeAddressKey(address: Address): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  return [norm(address.cep), norm(address.number), norm(address.complement ?? '')].join('|');
}

const HIGH_VALUE_CENTS = 50000; // R$ 500 — acima disso, "alto valor" pra fins de sinalização

interface OrderLike extends Pick<Order, 'id' | 'userId' | 'address' | 'totalCents' | 'clientIp' | 'createdAt'> {}

/**
 * Compara o pedido atual com outros pedidos "candidatos" (já filtrados por
 * uma janela de tempo razoável, ex. últimos 30 dias, e por terem endereço
 * ou IP em comum, na query que chama esta função) e retorna os sinais de
 * fraude leve encontrados. Puro: não acessa banco, fácil de testar.
 */
export function computeFraudSignals(order: OrderLike, candidates: OrderLike[]): FraudSignal[] {
  const signals: FraudSignal[] = [];
  const others = candidates.filter((c) => c.id !== order.id);

  // Mesmo endereço de entrega, usuário diferente: padrão clássico de
  // e-mail descartável reutilizando o mesmo endereço físico.
  const addrKey = normalizeAddressKey(order.address);
  const sameAddressDifferentUser = others.filter(
    (c) => normalizeAddressKey(c.address) === addrKey && c.userId !== order.userId
  );
  if (sameAddressDifferentUser.length > 0) {
    signals.push({
      reason: `Mesmo endereço de entrega usado por ${sameAddressDifferentUser.length === 1 ? 'outra conta' : `${sameAddressDifferentUser.length} outras contas`}`,
      relatedOrderIds: sameAddressDifferentUser.map((c) => c.id),
    });
  }

  // Mesmo IP, usuários diferentes, com pedido(s) de valor alto envolvido:
  // várias contas comprando do mesmo lugar não é incomum sozinho (ex.
  // família), mas some com valor alto vira sinal de teste de cartão/fraude.
  if (order.clientIp) {
    const sameIpDifferentUser = others.filter(
      (c) => c.clientIp && c.clientIp === order.clientIp && c.userId !== order.userId
    );
    const highValueInvolved =
      order.totalCents >= HIGH_VALUE_CENTS ||
      sameIpDifferentUser.some((c) => c.totalCents >= HIGH_VALUE_CENTS);
    if (sameIpDifferentUser.length > 0 && highValueInvolved) {
      signals.push({
        reason: `Mesmo IP usado por ${sameIpDifferentUser.length === 1 ? 'outra conta' : `${sameIpDifferentUser.length} outras contas`}, com pedido de valor alto`,
        relatedOrderIds: sameIpDifferentUser.map((c) => c.id),
      });
    }
  }

  return signals;
}
