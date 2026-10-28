import { describe, it, expect } from 'vitest';
import { apportion, brasiliaIso, buildNfe, chaveAcesso, chaveDv, NfeDataError, HOMOLOGACAO_DEST_NAME, randomCNF, type NfeOrder, type NfeIdentity } from './payload';
import { nfeConfigFrom } from './config';

const cents = (s: unknown) => Math.round(Number(s ?? 0) * 100);
const customer = { name: 'Maria da Silva', cpf: '529.982.247-25', email: 'maria@ex.com', phone: '(47) 99999-0000' };
const address = { cep: '89010-000', street: 'Rua XV de Novembro', number: '100', neighborhood: 'Centro', city: 'Blumenau', state: 'SC' };
const config = nfeConfigFrom({
  storeName: 'Mikma Lençóis', storeState: 'SC', storeCity: 'Blumenau', storeAddress: 'Rua das Flores', storeNumber: '10',
  storeNeighborhood: 'Centro', storeCep: '89010-100', storePhone: '(47) 3333-4444', storeEmail: 'contato@mikma.com.br',
  nfeRazaoSocial: 'MIKMA COMERCIO DE ROUPAS DE CAMA LTDA', nfeIe: '123.456.789',
});
const base: NfeOrder = {
  id: 'ord_abc123def456',
  items: [
    { sku: 'p1_queen', productName: 'Jogo de cama Queen', quantity: 2, unitPrice: 18990 },
    { sku: 'p2_v1', productName: 'Fronha', quantity: 1, unitPrice: 3333 },
  ],
  productsCents: 41313, shippingCents: 2500, totalCents: 43813,
  address, payment: { method: 'pix' }, delivery: { carrier: 'correios_pac' },
};
const ident: NfeIdentity = { numero: 123, serie: 1, cNF: '12345678', dhEmi: '2026-10-27T12:00:00-03:00', homologacao: false, cMunDest: '4202404' };

type Det = { prod: Record<string, string | number>; imposto: Record<string, unknown> };
function inf(order: NfeOrder, id: Partial<NfeIdentity> = {}) {
  const { nfe, chave } = buildNfe(order, customer, config, { ...ident, ...id });
  return { chave, inf: (nfe.NFe as { infNFe: Record<string, unknown> }).infNFe as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
function itemSum(det: Det[], k: string) { return det.reduce((a, d) => a + cents(d.prod[k]), 0); }

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

describe('chave de acesso', () => {
  // Mesmo cálculo da nfewizard-io (pesos 4,3,2,9..2 da esquerda).
  const libDv = (seq: string) => {
    const pesos = [4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = seq.split('').reduce((a, c, i) => a + Number(c) * pesos[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  it('dígito verificador igual ao da biblioteca e chave com 44 dígitos', () => {
    for (let i = 0; i < 50; i++) {
      const seq = Array.from({ length: 43 }, () => Math.floor(Math.random() * 10)).join('');
      expect(chaveDv(seq)).toBe(libDv(seq));
    }
    const chave = chaveAcesso('SC', '2026-10-27T12:00:00-03:00', '29966649000143', 1, 123, '12345678');
    expect(chave).toMatch(/^42261029966649000143550010000001231123456780?\d$/);
    expect(chave).toHaveLength(44);
  });
  it('código numérico nunca igual ao número da nota', () => {
    for (let i = 0; i < 20; i++) expect(Number(randomCNF(5))).not.toBe(5);
  });
});

describe('buildNfe', () => {
  it('pedido PIX em SC: CFOP interno, frete rateado e total exato', () => {
    const { inf: n, chave } = inf(base);
    const det = n.det as Det[];
    expect(n.Id).toBe(chave);
    expect(itemSum(det, 'vProd')).toBe(41313);
    expect(itemSum(det, 'vFrete')).toBe(2500);
    expect(itemSum(det, 'vProd') - itemSum(det, 'vDesc') + itemSum(det, 'vFrete') + itemSum(det, 'vOutro')).toBe(cents(n.total.ICMSTot.vNF));
    expect(cents(n.total.ICMSTot.vNF)).toBe(43813);
    expect(n.ide.idDest).toBe(1);
    expect(det.every(d => d.prod.CFOP === 5102)).toBe(true);
    expect(n.ide.indPres).toBe(2);
    expect(n.ide.indIntermed).toBe(0);
    expect(n.ide.tpAmb).toBe(1);
    expect(n.ide.cDV).toBe(Number(chave.slice(-1)));
    expect(n.dest.CNPJCPF).toBe('52998224725');
    expect(n.dest.xNome).toBe('Maria da Silva');
    expect(n.dest.indIEDest).toBe(9);
    expect(n.emit.IE).toBe('123456789');
    expect(n.emit.CRT).toBe(1);
    expect(n.pag.detPag.tPag).toBe('17');
    expect(det[0].imposto.ICMS).toEqual({ ICMSSN102: { orig: 0, CSOSN: 102 } });
    expect(det[0].imposto.PIS).toEqual({ PISOutr: { CST: '49', vBC: 0, pPIS: 0, vPIS: 0 } });
    expect(n.infRespTec.CNPJ).toBe('05338341000195');
  });

  it('desconto e acréscimo do cartão rateados, fora de SC', () => {
    const order: NfeOrder = {
      ...base, couponDiscountCents: 1000, discountCents: 1000, totalCents: 41313 - 1000 + 2500 + 1777,
      address: { ...address, state: 'sp', city: 'São Paulo' }, payment: { method: 'card' },
    };
    const { inf: n } = inf(order, { cMunDest: '3550308' });
    const det = n.det as Det[];
    expect(itemSum(det, 'vDesc')).toBe(1000);
    expect(itemSum(det, 'vOutro')).toBe(1777);
    expect(cents(n.total.ICMSTot.vDesc)).toBe(1000);
    expect(cents(n.total.ICMSTot.vOutro)).toBe(1777);
    expect(n.ide.idDest).toBe(2);
    expect(n.dest.enderDest.UF).toBe('SP');
    expect(det.every(d => d.prod.CFOP === 6102)).toBe(true);
    expect(n.pag.detPag.tPag).toBe('03');
    for (const d of det) expect(cents(d.prod.vDesc)).toBeLessThanOrEqual(cents(d.prod.vProd));
  });

  it('homologação: ambiente 2 e o nome exigido pela SEFAZ', () => {
    const { inf: n } = inf(base, { homologacao: true });
    expect(n.ide.tpAmb).toBe(2);
    expect(n.dest.xNome).toBe(HOMOLOGACAO_DEST_NAME);
  });

  it('retirada na loja: sem frete', () => {
    const { inf: n } = inf({ ...base, shippingCents: 0, totalCents: 41313, delivery: { carrier: 'pickup' } });
    expect(n.transp.modFrete).toBe(9);
    expect(n.total.ICMSTot.vFrete).toBe('0.00');
  });

  it('lista tudo o que falta em vez de mandar nota inválida', () => {
    try {
      buildNfe({ ...base, address: { ...address, cep: '123', state: 'XX' } }, { ...customer, cpf: '111.111.111-11' }, { ...config, ie: '' }, { ...ident, cMunDest: '' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(NfeDataError);
      const problems = (err as NfeDataError).problems.join(' | ');
      for (const p of [/CPF/, /CEP/, /UF do endereço/, /inscrição estadual/, /IBGE da cidade do cliente/]) expect(problems).toMatch(p);
    }
  });

  it('recusa totais incoerentes', () => {
    expect(() => buildNfe({ ...base, totalCents: 100 }, customer, config, ident)).toThrow(NfeDataError);
    expect(() => buildNfe({ ...base, productsCents: 1 }, customer, config, ident)).toThrow(NfeDataError);
  });

  it('limpa quebras de linha e limita tamanhos', () => {
    const { inf: n } = inf({ ...base, items: [{ ...base.items[0], productName: 'Jogo\nde cama' + 'x'.repeat(300) }], productsCents: 37980, totalCents: 40480 });
    const x = (n.det as Det[])[0].prod.xProd as string;
    expect(x).not.toMatch(/\n/);
    expect(x.length).toBeLessThanOrEqual(120);
  });
});

describe('brasiliaIso / nfeConfigFrom', () => {
  it('converte para o horário de Brasília', () => {
    expect(brasiliaIso(new Date('2026-01-01T02:30:00Z'))).toBe('2025-12-31T23:30:00-03:00');
  });
  it('usa o padrão campo a campo e os dados da loja', () => {
    const c = nfeConfigFrom({ nfeEnvironment: 'producao', nfeNcm: '6302.10.00', nfeCsosn: '', storeCnpj: '29.966.649/0001-43' });
    expect(c.environment).toBe('producao');
    expect(c.ncm).toBe('63021000');
    expect(c.csosn).toBe('102');
    expect(c.cnpj).toBe('29966649000143');
    expect(c.autoEmit).toBe(false);
    expect(c.codMunicipio).toBe('4202404');
  });
});
