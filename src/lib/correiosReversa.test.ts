import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/firebase/admin', () => ({ adminDb: {} }));
vi.mock('@/lib/uber-direct', () => ({}));

import { brDate, buildReversa, reversaProblems, SERVICO_REVERSO, type ClienteReversa } from './correiosReversa';
import type { Remetente } from './correiosPrepostagem';
import type { Order, ReturnRequest } from '@/types';

const loja: Remetente = {
  nome: 'GPM Textil Ltda', cnpj: '05338341000195', telefone: '47999990000', email: 'contato@mikma.com.br',
  endereco: { cep: '89042300', street: 'Rua da Loja', number: '100', neighborhood: 'Velha', city: 'Blumenau', state: 'SC' },
};
const cliente: ClienteReversa = {
  nome: 'Ana Prado', cpf: '111.444.777-35', email: 'ana@exemplo.com', telefone: '(11) 98888-7777',
  endereco: { cep: '01310-100', street: 'Avenida Paulista', number: '1000', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' },
};
const devolucao = {
  id: 'ret123', orderId: 'ord_abc123def456', type: 'troca',
  items: [{ sku: 'p3_v1', productId: 'p3', productName: 'Jogo de Cama King Malha Cinza', variant: {}, quantity: 1 }],
} as unknown as ReturnRequest;
const order = { items: [{ sku: 'p3_v1', unitPrice: 39990 }] } as unknown as Order;

describe('buildReversa', () => {
  it('cliente remete para a loja pelo PAC reverso, com validade em dd/MM/yyyy', () => {
    const { body, validade } = buildReversa(devolucao, order, cliente, loja, { weightKg: 1.5, now: new Date('2026-11-11T12:00:00Z') });
    expect(validade).toBe('2026-11-26');
    expect(body).toMatchObject({
      codigoServico: SERVICO_REVERSO,
      logisticaReversa: 'S',
      dataValidadeLogReversa: '26/11/2026',
      pesoInformado: '1500', comprimentoInformado: '30', larguraInformada: '25', alturaInformada: '10',
      remetente: { nome: 'Ana Prado', cpfCnpj: '11144477735', email: 'ana@exemplo.com', dddCelular: '11', celular: '988887777', endereco: { cep: '01310100', uf: 'SP' } },
      destinatario: { nome: 'GPM Textil Ltda', cpfCnpj: '05338341000195', endereco: { cep: '89042300', cidade: 'Blumenau' } },
      itensDeclaracaoConteudo: [{ conteudo: 'Jogo de Cama King Malha Cinza', quantidade: '1', valor: '399.90' }],
      observacao: 'Troca pedido ABC123DE',
    });
  });
});

describe('reversaProblems', () => {
  it('tudo certo', () => { expect(reversaProblems(cliente, loja)).toEqual([]); });
  it('sem CPF, sem e-mail e loja sem CNPJ', () => {
    expect(reversaProblems({ ...cliente, cpf: '', email: 'x' }, { ...loja, cnpj: '' })).toEqual([
      'Falta o CPF do cliente (os Correios exigem na devolução).',
      'Falta o e-mail do cliente (é para onde os Correios mandam o código).',
      'Faltam o CNPJ ou o endereço da loja (Configurações > Loja).',
    ]);
  });
});

describe('brDate', () => {
  it('data no fuso de Brasília', () => { expect(brDate(new Date('2026-11-12T01:00:00Z'))).toBe('11/11/2026'); });
});
