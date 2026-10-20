import { describe, it, expect } from 'vitest';
import { customerTimeline, customerCancelReason } from './customerTimeline';

const at = '2026-10-20T15:45:00Z';

describe('customerTimeline', () => {
  it('esconde as notas internas de um pedido real com Uber', () => {
    const ev = customerTimeline([
      { status: 'created', at, note: 'Pedido criado' },
      { status: 'payment_initiated', at, note: 'PIX gerado' },
      { status: 'paid', at, note: 'Pago manualmente por fora · teste · ATENÇÃO: txId do evento difere do registrado (E6NXMsfX)' },
      { status: 'preparing', at },
      { status: 'shipped', at, note: 'Despachado via Uber Direct · status: pending · ATENÇÃO: custo R$ 20,00 acima do frete cobrado' },
      { status: 'shipped', at, note: 'Procurando entregador (Uber Direct)' },
      { status: 'shipped', at, note: 'Entregador a caminho da loja' },
      { status: 'shipped', at, note: 'Entregador a caminho do cliente' },
      { status: 'delivered', at, note: 'Entregue via Uber Direct' },
    ]);
    expect(ev.map(e => e.title)).toEqual([
      'Pedido criado', 'Aguardando pagamento', 'Pagamento confirmado', 'Pedido em preparação', 'Pedido despachado',
      'Procurando entregador', 'Entregador a caminho da loja', 'Entregador a caminho', 'Pedido entregue',
    ]);
    const text = JSON.stringify(ev);
    for (const leak of ['txId', 'manualmente', 'ATENÇÃO', 'custo', 'status: pending', 'Uber Direct']) {
      expect(text).not.toContain(leak);
    }
    expect(ev[1].detail).toBe('PIX gerado');
  });

  it('estorno vira "Reembolso feito" sem o e-mail de quem fez', () => {
    const ev = customerTimeline([
      { status: 'cancelled', at, note: 'Cancelado pelo lojista' },
      { status: 'cancelled', at, note: 'Estorno de R$ 10,00 feito pela AbacatePay por loja@x.com' },
      { status: 'cancelled', at, note: 'Estorno confirmado pela AbacatePay' },
    ]);
    expect(ev.map(e => e.title)).toEqual(['Pedido cancelado', 'Reembolso feito']);
    expect(JSON.stringify(ev)).not.toContain('loja@x.com');
  });

  it('esconde pagamento atrasado, contestação, rastreio corrigido e status desconhecido', () => {
    const ev = customerTimeline([
      { status: 'cancelled', at, note: 'Pagamento recebido depois do cancelamento (x). Estorne o cliente ou marque o pedido como pago.' },
      { status: 'paid', at, note: 'Contestação aberta pelo cliente' },
      { status: 'shipped', at, note: 'Código de rastreio corrigido (era AA1)' },
      { status: 'qualquer_coisa', at, note: 'debug' },
    ]);
    expect(ev).toEqual([]);
  });

  it('cartão mostra as parcelas', () => {
    const [, ev] = customerTimeline([{ status: 'created', at }, { status: 'payment_initiated', at, note: 'Cartão no site (3x)' }]);
    expect(ev.detail).toBe('Cartão de crédito em 3x');
  });
});

describe('customerCancelReason', () => {
  it('mostra o motivo do lojista, não a nota de estorno', () => {
    expect(customerCancelReason([
      { status: 'cancelled', at, note: 'Produto sem estoque, desculpe!' },
      { status: 'cancelled', at, note: 'Estorno feito, registrado por loja@x.com' },
    ])).toBe('Produto sem estoque, desculpe!');
  });
  it('cancelado pelo cliente', () => {
    expect(customerCancelReason([{ status: 'cancelled', at, note: 'Cancelado pelo cliente' }])).toBe('Cancelado por você');
  });
  it('pagamento atrasado não aparece como motivo', () => {
    expect(customerCancelReason([{ status: 'cancelled', at, note: 'Pagamento recebido depois do cancelamento (x).' }])).toBeUndefined();
  });
});
