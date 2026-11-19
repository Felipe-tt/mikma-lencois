import { describe, it, expect } from 'vitest';
import { LEGAL_PAGES, LEGAL_UPDATED_AT, LEGAL_UPDATED_LABEL, LEGAL_VERSION, storeIdentity } from './legal';
import type { StoreSettings } from '@/lib/store-settings';

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

describe('storeIdentity (Decreto 7.962/2013)', () => {
  const base = { storeName: 'Mikma Lençóis', storeCnpj: '', storeCity: 'Blumenau', storeState: 'SC' } as unknown as StoreSettings;

  it('mostra a razão social quando é diferente do nome da loja', () => {
    expect(storeIdentity({ ...base, nfeRazaoSocial: 'Mikma Comércio de Enxovais Ltda' }).legalName).toBe('Mikma Comércio de Enxovais Ltda');
    expect(storeIdentity({ ...base, nfeRazaoSocial: 'MIKMA LENÇÓIS' }).legalName).toBe('');
    expect(storeIdentity(base).legalName).toBe('');
  });

  it('usa o CNPJ da nota fiscal quando o da loja está vazio, já formatado', () => {
    expect(storeIdentity({ ...base, nfeCnpj: '05338341000195' }).cnpj).toBe('05.338.341/0001-95');
    expect(storeIdentity({ ...base, storeCnpj: '11.222.333/0001-81', nfeCnpj: '05338341000195' }).cnpj).toBe('11.222.333/0001-81');
    expect(storeIdentity(base).cnpj).toBe('');
  });
});
