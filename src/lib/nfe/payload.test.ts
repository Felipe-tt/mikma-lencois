import { describe, it, expect } from 'vitest';
import { apportion, brasiliaIso, buildNfePayload, NfeDataError, HOMOLOGACAO_DEST_NAME, type NfeOrder } from './payload';
import { NFE_DEFAULTS, nfeConfigFrom } from './config';

const cents = (s: unknown) => Math.round(Number(s) * 100);
const customer = { name: 'Maria da Silva', cpf: '529.982.247-25', email: 'maria@ex.com', phone: '(47) 99999-0000' };
const address = { cep: '89010-000', street: 'Rua XV de Novembro', number: '100', neighborhood: 'Centro', city: 'Blumenau', state: 'SC' };
const base: NfeOrder = {
  id: 'ord_abc123def456',
  items: [
    { sku: 'p1_queen', productName: 'Jogo de cama Queen', quantity: 2, unitPrice: 18990 },
    { sku: 'p2_v1', productName: 'Fronha', quantity: 1, unitPrice: 3333 },
  ],
  productsCents: 41313, shippingCents: 2500, totalCents: 43813,
  address, payment: { method: 'pix' }, delivery: { carrier: 'correios_pac' },
};

function totals(p: Record<string, unknown>) {
  const items = p.items as Record<string, unknown>[];
  const sum = (k: string) => items.reduce((a, i) => a + cents(i[k] ?? 0), 0);
  return { bruto: sum('valor_bruto'), desconto: sum('valor_desconto'), frete: sum('valor_frete'), outras: sum('valor_outras_despesas') };
}

describe('apportion', () => {
  it('reparte sem perder centavo e na proporção', () => {
    expect(apportion(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(apportion(1, [3, 1])).toEqual([1, 0]);
    expect(apportion(500, [0, 100])).toEqual([0, 500]);
    expect(apportion(0, [5, 5])).toEqual([0, 0]);
    for (const [t, w] of [[999, [7, 13, 1]], [4381, [37980, 3333]], [1, [1, 1, 1]]] as const) {
      expect(apportion(t, [...w]).reduce((a, b) => a + b, 0)).toBe(t);
    }
  });
});

describe('buildNfePayload', () => {
  const cfg = NFE_DEFAULTS;

  it('pedido PIX em SC: CFOP interno, frete rateado e total exato', () => {
    const p = buildNfePayload(base, customer, cfg, { homologacao: false, now: new Date('2026-10-27T15:00:00Z') });
    const t = totals(p);
    expect(t.bruto).toBe(41313);
    expect(t.frete).toBe(2500);
    expect(t.bruto - t.desconto + t.frete + t.outras).toBe(43813);
    expect(cents(p.valor_total)).toBe(43813);
    expect(p.local_destino).toBe(1);
    expect((p.items as { cfop: string }[]).every(i => i.cfop === '5102')).toBe(true);
    expect(p.cpf_destinatario).toBe('52998224725');
    expect(p.nome_destinatario).toBe('Maria da Silva');
    expect(p.presenca_comprador).toBe(2);
    expect(p.indicador_intermediario).toBe(0);
    expect(p.data_emissao).toBe('2026-10-27T12:00:00-03:00');
    expect((p.formas_pagamento as { forma_pagamento: string }[])[0].forma_pagamento).toBe('17');
  });

  it('desconto PIX + cupom rateado e cartão parcelado como outras despesas, fora de SC', () => {
    const order: NfeOrder = {
      ...base, pixDiscountCents: 0, couponDiscountCents: 1000, discountCents: 1000,
      totalCents: 41313 - 1000 + 2500 + 1777, address: { ...address, state: 'sp', city: 'São Paulo' },
      payment: { method: 'card' },
    };
    const p = buildNfePayload(order, customer, cfg, { homologacao: false });
    const t = totals(p);
    expect(t.desconto).toBe(1000);
    expect(t.outras).toBe(1777);
    expect(t.bruto - t.desconto + t.frete + t.outras).toBe(order.totalCents);
    expect(p.local_destino).toBe(2);
    expect(p.uf_destinatario).toBe('SP');
    expect((p.items as { cfop: string }[]).every(i => i.cfop === '6102')).toBe(true);
    expect((p.formas_pagamento as { forma_pagamento: string }[])[0].forma_pagamento).toBe('03');
    // Nenhum item com desconto maior que o próprio valor.
    for (const i of p.items as Record<string, string>[]) expect(cents(i.valor_desconto ?? 0)).toBeLessThanOrEqual(cents(i.valor_bruto));
  });

  it('homologação troca o nome do destinatário pelo texto exigido pela SEFAZ', () => {
    const p = buildNfePayload(base, customer, cfg, { homologacao: true });
    expect(p.nome_destinatario).toBe(HOMOLOGACAO_DEST_NAME);
  });

  it('retirada na loja: sem frete', () => {
    const p = buildNfePayload({ ...base, shippingCents: 0, totalCents: 41313, delivery: { carrier: 'pickup' } }, customer, cfg, { homologacao: false });
    expect(p.modalidade_frete).toBe(9);
    expect(p.valor_frete).toBeUndefined();
  });

  it('lista tudo o que falta em vez de mandar nota inválida', () => {
    try {
      buildNfePayload({ ...base, address: { ...address, cep: '123', state: 'XX' } }, { ...customer, cpf: '111.111.111-11' }, cfg, { homologacao: false });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(NfeDataError);
      const problems = (err as NfeDataError).problems.join(' | ');
      expect(problems).toMatch(/CPF/);
      expect(problems).toMatch(/CEP/);
      expect(problems).toMatch(/UF/);
    }
  });

  it('recusa totais incoerentes', () => {
    expect(() => buildNfePayload({ ...base, totalCents: 100 }, customer, cfg, { homologacao: false })).toThrow(NfeDataError);
    expect(() => buildNfePayload({ ...base, productsCents: 1 }, customer, cfg, { homologacao: false })).toThrow(NfeDataError);
  });

  it('limpa quebras de linha e limita tamanhos', () => {
    const p = buildNfePayload({ ...base, items: [{ ...base.items[0], productName: 'Jogo\nde cama' + 'x'.repeat(300) }], productsCents: 37980, totalCents: 40480 }, customer, cfg, { homologacao: false });
    const d = (p.items as { descricao: string }[])[0].descricao;
    expect(d).not.toMatch(/\n/);
    expect(d.length).toBeLessThanOrEqual(120);
  });
});

describe('brasiliaIso / nfeConfigFrom', () => {
  it('converte para o horário de Brasília', () => {
    expect(brasiliaIso(new Date('2026-01-01T02:30:00Z'))).toBe('2025-12-31T23:30:00-03:00');
  });
  it('usa o padrão campo a campo', () => {
    const c = nfeConfigFrom({ nfeEnvironment: 'producao', nfeNcm: '6302.10.00', nfeCsosn: '' });
    expect(c.environment).toBe('producao');
    expect(c.ncm).toBe('63021000');
    expect(c.csosn).toBe('102');
    expect(c.autoEmit).toBe(false);
  });
});
