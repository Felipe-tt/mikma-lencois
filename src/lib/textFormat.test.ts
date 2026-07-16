import { describe, it, expect } from 'vitest';
import { formatProductName } from './textFormat';

describe('formatProductName', () => {
  it('tira CAPS LOCK e separa número colado em palavra', () => {
    expect(formatProductName('LENÇO QUEEN 3PÇS')).toBe('Lenço Queen 3 Peças');
  });

  it('colapsa espaços duplicados/extras', () => {
    expect(formatProductName('jogo   casal  padrão')).toBe('Jogo Casal Padrão');
  });

  it('mantém preposições em minúsculo, exceto na primeira palavra', () => {
    expect(formatProductName('JOGO DE CAMA COM 3 PEÇAS')).toBe('Jogo de Cama com 3 Peças');
  });

  it('capitaliza a preposição quando ela é a primeira palavra', () => {
    expect(formatProductName('de cama queen')).toBe('De Cama Queen');
  });

  it('preserva acentuação ao capitalizar', () => {
    expect(formatProductName('EDREDOM SOLTEIRO')).toBe('Edredom Solteiro');
    expect(formatProductName('lençóis king')).toBe('Lençóis King');
  });

  it('expande abreviações comuns de peças/unidade', () => {
    expect(formatProductName('kit 4pcs')).toBe('Kit 4 Peças');
    expect(formatProductName('KIT 1PC')).toBe('Kit 1 Peça');
    expect(formatProductName('caixa 2und')).toBe('Caixa 2 Unidade');
  });

  it('trata string vazia ou só espaços sem quebrar', () => {
    expect(formatProductName('')).toBe('');
    expect(formatProductName('   ')).toBe('');
  });

  it('já formatado direito continua igual', () => {
    expect(formatProductName('Jogo Queen 3 Peças')).toBe('Jogo Queen 3 Peças');
  });
});
