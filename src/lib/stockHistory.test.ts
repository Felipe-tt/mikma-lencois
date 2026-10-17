import { describe, expect, it } from 'vitest';
import { orderStockLog } from './stockHistory';

describe('orderStockLog', () => {
  it('venda online sai do estoque com o código curto do pedido', () => {
    const log = orderStockLog('abcdefgh12345678', 'online_sale', 2, 0, '2026-10-17T10:00:00.000Z');
    expect(log).toEqual({
      type: 'out', quantity: 2, reason: 'Pedido #12345678', date: '2026-10-17T10:00:00.000Z',
      by: 'sistema', source: 'online_sale', order: '12345678', line: 0,
    });
  });

  it('cancelamento devolve ao estoque', () => {
    expect(orderStockLog('xyzabc99', 'order_cancel', 1, 3).type).toBe('in');
  });

  it('linhas diferentes do mesmo pedido geram entradas diferentes', () => {
    const a = orderStockLog('o1', 'online_sale', 1, 0, 'd');
    const b = orderStockLog('o1', 'online_sale', 1, 1, 'd');
    expect(a).not.toEqual(b);
  });

  it('não grava o id inteiro do pedido (inventory é público)', () => {
    const log = orderStockLog('privateprefix-ABCDEFGH', 'online_sale', 1, 0);
    expect(JSON.stringify(log)).not.toContain('privateprefix');
  });
});
