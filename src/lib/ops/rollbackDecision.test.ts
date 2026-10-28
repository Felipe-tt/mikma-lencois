import { describe, it, expect } from 'vitest';
import { decideRollback, AUTO_PREFIX } from '../../../scripts/lib/rollback-decision.mjs';

const B = 'projects/p/locations/l/backends/b';
const now = Date.parse('2026-10-28T12:00:00Z');
const r = (id: string, build: string, minutesAgo: number, state = 'SUCCEEDED') => ({
  name: `${B}/rollouts/${id}`, build: `${B}/builds/${build}`, state, createTime: new Date(now - minutesAgo * 60_000).toISOString(),
});

describe('decideRollback', () => {
  it('deploy recente quebrado: volta para a última versão boa anterior', () => {
    const d = decideRollback([r('r3', 'b3', 10), r('r2', 'b2', 300), r('r1', 'b1', 900)], now);
    expect(d.action).toBe('rollback');
    expect(d.to.build).toMatch(/b2$/);
    expect(d.from.build).toMatch(/b3$/);
  });
  it('ignora rollouts que falharam e builds repetidos', () => {
    const d = decideRollback([r('r4', 'b3', 5), r('r3x', 'b9', 20, 'FAILED'), r('r3', 'b3', 30), r('r2', 'b2', 400)], now);
    expect(d.to.build).toMatch(/b2$/);
  });
  it('versão no ar antiga: não mexe (o problema não é o deploy)', () => {
    expect(decideRollback([r('r2', 'b2', 600), r('r1', 'b1', 2000)], now).action).toBe('none');
  });
  it('nunca faz rollback por cima de rollback automático', () => {
    const d = decideRollback([r(`${AUTO_PREFIX}123`, 'b2', 5), r('r3', 'b3', 20), r('r2', 'b2', 300)], now);
    expect(d.action).toBe('none');
    expect(d.reason).toMatch(/rollback automático/);
  });
  it('sem versão anterior ou sem dados: não faz nada', () => {
    expect(decideRollback([r('r1', 'b1', 5)], now).action).toBe('none');
    expect(decideRollback([], now).action).toBe('none');
    expect(decideRollback(undefined, now).action).toBe('none');
  });
});
