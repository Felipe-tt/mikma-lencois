import { describe, expect, it } from 'vitest';
import { uberPushMessage } from './uberMessages';

describe('aviso da equipe quando a corrida da Uber muda', () => {
  it('coleta, entrega, cancelamento e devolução viram aviso com os itens do pedido', () => {
    expect(uberPushMessage('pickup', '2 lençóis')).toEqual({ title: 'Motoboy a caminho da loja 🛵', body: 'Uber Direct já está indo buscar: 2 lençóis. Deixa separado!' });
    expect(uberPushMessage('delivered', '2 lençóis')?.body).toBe('2 lençóis foi entregue pelo Uber Direct.');
    expect(uberPushMessage('canceled', '2 lençóis')?.body).toBe('Precisa despachar de novo: 2 lençóis');
    expect(uberPushMessage('returned', '2 lençóis')?.body).toBe('2 lençóis voltou pra loja, confira o pedido.');
  });

  it('passos do meio da corrida e qualquer outro texto do webhook não viram aviso', () => {
    for (const status of ['pending', 'pickup_complete', 'dropoff', 'constructor', 'toString', '__proto__', 'hasOwnProperty', '']) {
      expect(uberPushMessage(status, '2 lençóis')).toBeNull();
    }
  });
});
