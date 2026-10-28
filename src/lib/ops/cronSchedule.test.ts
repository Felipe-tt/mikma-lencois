import { describe, expect, it } from 'vitest';
import { dueJobs, healthDue, JOBS } from '../../../workers/cron/schedule.mjs';

const at = (h: number, m: number) => new Date(Date.UTC(2026, 9, 28, h, m));

describe('agenda do Worker de rotinas', () => {
  it('expira pedidos a cada 15 min e emite notas a cada 10 min', () => {
    expect(dueJobs(at(13, 0))).toEqual(expect.arrayContaining([JOBS.expirarPedidos, JOBS.notasFiscais]));
    expect(dueJobs(at(13, 15))).toEqual([JOBS.expirarPedidos]);
    expect(dueJobs(at(13, 10))).toEqual([JOBS.notasFiscais]);
    expect(dueJobs(at(13, 5))).toEqual([]);
  });

  it('aviso de reposição de hora em hora e estoque baixo a cada 6 h', () => {
    expect(dueJobs(at(13, 20))).toContain(JOBS.avisoReposicao);
    expect(dueJobs(at(12, 0))).toContain(JOBS.estoqueBaixo);
    expect(dueJobs(at(13, 0))).not.toContain(JOBS.estoqueBaixo);
  });

  it('cada rotina roda o número certo de vezes por dia', () => {
    const count: Record<string, number> = {};
    for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 5) {
      for (const p of dueJobs(at(h, m))) count[p] = (count[p] ?? 0) + 1;
    }
    expect(count).toEqual({
      [JOBS.expirarPedidos]: 96,
      [JOBS.notasFiscais]: 144,
      [JOBS.avisoReposicao]: 24,
      [JOBS.estoqueBaixo]: 4,
    });
  });

  it('saúde a cada 10 min, nos minutos 5, 15, 25...', () => {
    expect(healthDue(at(13, 5))).toBe(true);
    expect(healthDue(at(13, 15))).toBe(true);
    expect(healthDue(at(13, 10))).toBe(false);
  });
});
