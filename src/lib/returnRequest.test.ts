import { describe, it, expect } from 'vitest';
import { TROCA_FORA_DO_PRAZO, fimDoPrazo, returnWindow } from './returnRequest';
import type { Order } from '@/types';

const order = (status: string, deliveredAt?: string) => ({ status, createdAt: '2026-10-01T12:00:00Z', delivery: { carrier: 'correios_pac', ...(deliveredAt ? { deliveredAt } : {}) } }) as unknown as Order;
const now = new Date('2026-11-11T12:00:00Z');

describe('returnWindow', () => {
  it('só depois de entregue', () => {
    expect(returnWindow(order('shipped'), now)).toEqual({ ok: false, reason: 'A troca é pedida depois que o pedido é entregue.' });
  });
  it('até 7 dias da entrega: troca, devolução e defeito', () => {
    const w = returnWindow(order('delivered', '2026-11-06T12:00:00Z'), now);
    // Entregue sexta, 06/11: o 7º dia é sexta, 13/11, até 23:59 de Brasília.
    expect(w).toMatchObject({ ok: true, troca: true, trocaAte: new Date('2026-11-13T23:59:59.999-03:00') });
  });
  it('no limite dos 7 dias ainda dá troca', () => {
    expect(returnWindow(order('delivered', '2026-11-04T12:00:00Z'), now)).toMatchObject({ ok: true, troca: true });
  });
  it('depois de 7 dias, só defeito, até 90', () => {
    expect(returnWindow(order('delivered', '2026-10-01T12:00:00Z'), now)).toMatchObject({ ok: true, troca: false, defeitoAte: new Date('2026-12-30T23:59:59.999-03:00') });
  });
  it('passados 90 dias, não dá mais por aqui (defeito que apareceu depois vai pelo atendimento)', () => {
    const r = returnWindow(order('delivered', '2026-07-01T12:00:00Z'), now);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/WhatsApp/);
    expect(!r.ok && r.reason).not.toMatch(/já passou/);
  });
  it('o 7º dia vale inteiro, sem contar o dia da entrega', () => {
    // Entregue quarta, 04/11, às 10h: vale até o fim de quarta, 11/11.
    const entrega = '2026-11-04T13:00:00Z';
    expect(returnWindow(order('delivered', entrega), new Date('2026-11-11T22:00:00Z'))).toMatchObject({ ok: true, troca: true });
    expect(returnWindow(order('delivered', entrega), new Date('2026-11-12T03:30:00Z'))).toMatchObject({ ok: true, troca: false });
  });
  it('último dia em fim de semana ou feriado vai até o próximo dia útil', () => {
    // Entregue sábado, 07/11: o 7º dia é sábado, 14/11; domingo também não; vale até segunda, 16/11.
    expect(fimDoPrazo(new Date('2026-11-07T15:00:00Z'), 7)).toEqual(new Date('2026-11-16T23:59:59.999-03:00'));
    // Entregue sexta, 13/11: o 7º dia é sexta, 20/11 (Consciência Negra); vale até segunda, 23/11.
    expect(fimDoPrazo(new Date('2026-11-13T15:00:00Z'), 7)).toEqual(new Date('2026-11-23T23:59:59.999-03:00'));
    // Entrega às 23h de Brasília (já é o dia seguinte em UTC) conta o dia de Brasília.
    expect(fimDoPrazo(new Date('2026-11-10T02:00:00Z'), 7)).toEqual(new Date('2026-11-16T23:59:59.999-03:00'));
  });
  it('sem data de entrega, conta da compra', () => {
    expect(returnWindow(order('delivered'), now)).toMatchObject({ ok: true, troca: false });
  });
  it('a mensagem fora do prazo aponta para defeito', () => {
    expect(TROCA_FORA_DO_PRAZO).toMatch(/7 dias/);
    expect(TROCA_FORA_DO_PRAZO).toMatch(/Defeito/);
  });
});

import { devolucaoPadrao, motivoFinal, opcoesDevolucao } from './returnRequest';

describe('motivoFinal', () => {
  it('motivo pronto basta, texto é opcional', () => {
    expect(motivoFinal('troca', 'Não coube no colchão', '')).toEqual({ ok: true, reason: 'Não coube no colchão' });
    expect(motivoFinal('troca', 'Não coube no colchão', 'era king, quero queen')).toEqual({ ok: true, reason: 'Não coube no colchão: era king, quero queen' });
  });
  it('"Outro" exige texto', () => {
    expect(motivoFinal('defeito', 'Outro defeito', 'curto')).toEqual({ ok: false, error: 'Conte qual é o defeito.' });
    expect(motivoFinal('defeito', 'Outro defeito', 'o lençol desfiou na barra')).toEqual({ ok: true, reason: 'o lençol desfiou na barra' });
  });
  it('sem motivo ou motivo de outro tipo é recusado', () => {
    expect(motivoFinal('devolucao', undefined, 'qualquer coisa')).toMatchObject({ ok: false });
    expect(motivoFinal('troca', 'Mancha ou sujeira', '')).toEqual({ ok: false, error: 'Motivo inválido.' });
  });
});

describe('por onde as peças voltam', () => {
  it('segue a entrega do pedido, com a loja como alternativa', () => {
    expect(opcoesDevolucao({ delivery: { carrier: 'correios_pac' } })).toEqual(['correios', 'loja']);
    expect(opcoesDevolucao({ delivery: { carrier: 'correios_sedex' } })).toEqual(['correios', 'loja']);
    expect(opcoesDevolucao({ delivery: { carrier: 'uber_direct' } })).toEqual(['uber', 'loja']);
    expect(opcoesDevolucao({ delivery: { carrier: 'pickup' } })).toEqual(['loja']);
  });
  it('sem transportadora gravada, usa a escolha do checkout', () => {
    expect(devolucaoPadrao({ delivery: { carrier: null }, selectedShipping: { carrier: 'uber_direct' } })).toBe('uber');
    expect(devolucaoPadrao({})).toBe('correios');
  });
});
