import { describe, it, expect } from 'vitest';
import { LEGAL_PAGES, LEGAL_UPDATED_AT, LEGAL_UPDATED_LABEL, LEGAL_VERSION } from './legal';

describe('dados legais', () => {
  it('ao visitante aparece a data por extenso, sem pular de dia pelo fuso', () => {
    const [y, m, d] = LEGAL_UPDATED_AT.split('-').map(Number);
    expect(LEGAL_UPDATED_LABEL).toMatch(/^\d{1,2} de [a-zç]+ de \d{4}$/);
    expect(LEGAL_UPDATED_LABEL.startsWith(`${d} de `)).toBe(true);
    expect(LEGAL_UPDATED_LABEL.endsWith(` de ${y}`)).toBe(true);
    expect(m).toBeGreaterThanOrEqual(1);
  });

  it('o registro interno do aceite guarda a data completa', () => {
    expect(LEGAL_VERSION).toBe(LEGAL_UPDATED_AT);
    expect(LEGAL_UPDATED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('lista de políticas sem duplicatas e com rotas absolutas', () => {
    const hrefs = LEGAL_PAGES.map(p => p.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const h of hrefs) expect(h.startsWith('/')).toBe(true);
  });
});
