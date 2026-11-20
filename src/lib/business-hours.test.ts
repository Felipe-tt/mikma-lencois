import { describe, expect, it } from 'vitest';
import { DEFAULT_BUSINESS_HOURS, nextDispatchWindow } from './business-hours';

// Horário padrão: seg a sex 08:00-18:00, sáb 08:00-12:00, domingo fechado.
const at = (iso: string) => new Date(iso);

describe('nextDispatchWindow', () => {
  it('aberto com tempo para preparar: sai hoje', () => {
    // quarta 18/11/2026 10:00 em Brasília
    expect(nextDispatchWindow(DEFAULT_BUSINESS_HOURS, at('2026-11-18T13:00:00Z'))).toEqual({ today: true, dayLabel: 'hoje', from: null });
  });
  it('antes de abrir: sai hoje, a partir da abertura', () => {
    expect(nextDispatchWindow(DEFAULT_BUSINESS_HOURS, at('2026-11-18T09:30:00Z'))).toEqual({ today: true, dayLabel: 'hoje', from: '08:00' });
  });
  it('perto de fechar ou de noite: sai no próximo dia aberto', () => {
    // quarta 17:30 (menos de 1h para fechar)
    expect(nextDispatchWindow(DEFAULT_BUSINESS_HOURS, at('2026-11-18T20:30:00Z'))).toEqual({ today: false, dayLabel: 'amanhã', from: '08:00' });
    // sábado 13:00, domingo fechado: segunda
    expect(nextDispatchWindow(DEFAULT_BUSINESS_HOURS, at('2026-11-21T16:00:00Z'))).toEqual({ today: false, dayLabel: 'segunda', from: '08:00' });
  });
  it('loja sem nenhum horário: sem previsão', () => {
    const fechada = Object.fromEntries(Object.entries(DEFAULT_BUSINESS_HOURS).map(([k]) => [k, { closed: true, ranges: [] }])) as unknown as typeof DEFAULT_BUSINESS_HOURS;
    expect(nextDispatchWindow(fechada, at('2026-11-18T13:00:00Z'))).toBeNull();
  });
});
