import { describe, it, expect } from 'vitest';
import { formatLegalDate, LEGAL_UPDATED_AT, LEGAL_UPDATED_LABEL, LEGAL_VERSION } from './legal';

describe('formatLegalDate', () => {
  it('formata em português sem zero à esquerda', () => {
    expect(formatLegalDate('2026-10-07')).toBe('7 de outubro de 2026');
    expect(formatLegalDate('2026-01-01')).toBe('1 de janeiro de 2026');
    expect(formatLegalDate('2027-03-15')).toBe('15 de março de 2027');
    expect(formatLegalDate('2026-12-31')).toBe('31 de dezembro de 2026');
  });

  it('o rótulo exibido vem da mesma data usada no registro de aceite', () => {
    expect(LEGAL_UPDATED_LABEL).toBe(formatLegalDate(LEGAL_UPDATED_AT));
    expect(LEGAL_VERSION).toBe(LEGAL_UPDATED_AT);
    expect(LEGAL_UPDATED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
