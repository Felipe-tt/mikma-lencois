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
