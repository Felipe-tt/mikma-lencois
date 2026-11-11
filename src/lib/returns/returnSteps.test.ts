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

describe('etapas pela Uber e na loja', () => {
  it('Uber: coletada e chegou vêm da corrida', () => {
    const t = { ...base, status: 'aprovada' as const, devolverPor: 'uber' as const, coletaUber: { deliveryId: 'd', createdAt: '2026-11-12T10:00:00Z', coletadoEm: '2026-11-12T10:20:00Z' } };
    const { etapas, atual } = etapasDaTroca(t);
    expect(etapas.map(e => e.label)).toEqual(['Pedido enviado', 'Aprovada', 'Coletada', 'Chegou na loja', 'Concluída']);
    expect(atual).toBe('postada');
    expect(etapasDaTroca({ ...t, coletaUber: { ...t.coletaUber, entregueEm: '2026-11-12T10:40:00Z' } }).atual).toBe('chegou');
  });
  it('loja: sem etapa de envio, chega quando a equipe recebe', () => {
    const t = { ...base, status: 'aprovada' as const, devolverPor: 'loja' as const };
    expect(etapasDaTroca(t).etapas.map(e => e.id)).toEqual(['solicitada', 'aprovada', 'chegou', 'concluida']);
    expect(etapasDaTroca(t).atual).toBe('aprovada');
    expect(etapasDaTroca({ ...t, recebidaEm: '2026-11-13T15:00:00Z' }).atual).toBe('chegou');
  });
});
