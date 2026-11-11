import { describe, it, expect } from 'vitest';
import { diasParaPostar, etapasDaTroca } from './returnSteps';

const base = { createdAt: '2026-11-10T12:00:00Z' };

describe('etapasDaTroca', () => {
  it('solicitada: só a primeira etapa feita', () => {
    const { etapas, atual } = etapasDaTroca({ ...base, status: 'solicitada' });
    expect(atual).toBe('solicitada');
    expect(etapas.filter(e => e.feita).map(e => e.id)).toEqual(['solicitada']);
  });
  it('aprovada com código, ainda não postada', () => {
    const { atual } = etapasDaTroca({ ...base, status: 'aprovada', reversa: { codigoObjeto: 'LR1', validade: '2026-11-25' } });
    expect(atual).toBe('aprovada');
  });
  it('postada e chegou pelo rastreio', () => {
    expect(etapasDaTroca({ ...base, status: 'aprovada', reversa: { codigoObjeto: 'LR1', validade: '2026-11-25', postadoEm: '2026-11-12' } }).atual).toBe('postada');
    expect(etapasDaTroca({ ...base, status: 'aprovada', reversa: { codigoObjeto: 'LR1', validade: '2026-11-25', postadoEm: '2026-11-12', entregueEm: '2026-11-14' } }).atual).toBe('chegou');
  });
  it('concluída sem código (trocada na loja) marca tudo', () => {
    const { etapas, atual } = etapasDaTroca({ ...base, status: 'concluida' });
    expect(atual).toBe('concluida');
    expect(etapas.every(e => e.feita)).toBe(true);
  });
  it('recusada mostra só o pedido e o estado recusado', () => {
    const { etapas, atual } = etapasDaTroca({ ...base, status: 'recusada' });
    expect(atual).toBe('recusada');
    expect(etapas).toHaveLength(1);
  });
});

describe('diasParaPostar', () => {
  it('conta os dias até o fim do último dia', () => {
    expect(diasParaPostar('2026-11-25', new Date('2026-11-20T15:00:00-03:00'))).toBe(5);
    expect(diasParaPostar('2026-11-25', new Date('2026-11-25T10:00:00-03:00'))).toBe(0);
    expect(diasParaPostar('2026-11-25', new Date('2026-11-27T10:00:00-03:00'))).toBe(0);
  });
});
