import { describe, it, expect } from 'vitest';
import { addBusinessDays, estimatedDate } from './deliveryDate';

describe('deliveryDate', () => {
  it('pula sábado e domingo', () => {
    // sexta + 1 dia útil = segunda; quarta + 5 = quarta seguinte
    expect(addBusinessDays(new Date('2026-11-13T12:00:00'), 1).getDate()).toBe(16);
    expect(addBusinessDays(new Date('2026-11-11T12:00:00'), 5).getDate()).toBe(18);
  });
  it('mostra a data curta, ou "Hoje"', () => {
    expect(estimatedDate(0)).toBe('Hoje');
    expect(estimatedDate(1, new Date('2026-11-13T12:00:00'))).toMatch(/16\/11/);
  });
});

describe('feriados e fuso', () => {
  it('pula feriado nacional (Consciência Negra)', () => {
    // quinta 19/11/2026 + 1 dia útil: sexta 20 é feriado, cai na segunda 23
    expect(estimatedDate(1, new Date('2026-11-19T15:00:00Z'))).toMatch(/23\/11/);
  });
  it('pula o Carnaval e a Sexta-feira Santa', () => {
    // Páscoa de 2027 é 28/03: Carnaval 08 e 09/02, Sexta-feira Santa 26/03
    expect(estimatedDate(1, new Date('2027-02-05T15:00:00Z'))).toMatch(/10\/02/);
    expect(estimatedDate(1, new Date('2027-03-25T15:00:00Z'))).toMatch(/29\/03/);
  });
  it('conta no calendário de Brasília, não no do servidor', () => {
    // 02:30 UTC de terça 17/11 ainda é segunda 16/11 às 23:30 em Brasília
    expect(estimatedDate(1, new Date('2026-11-17T02:30:00Z'))).toMatch(/17\/11/);
  });
});
