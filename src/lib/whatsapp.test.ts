import { describe, it, expect } from 'vitest';
import { storeWhatsapp, whatsappWithText } from './whatsapp';

describe('storeWhatsapp', () => {
  it('usa o link colado quando é do WhatsApp', () => {
    expect(storeWhatsapp({ whatsappUrl: 'https://wa.me/5547999990000' })).toBe('https://wa.me/5547999990000');
  });
  it('monta pelo número, com ou sem 55 e máscara', () => {
    expect(storeWhatsapp({ storePhone: '(47) 99999-0000' })).toBe('https://wa.me/5547999990000');
    expect(storeWhatsapp({ storePhone: '+55 47 99999-0000' })).toBe('https://wa.me/5547999990000');
  });
  it('número sem o 55 não vira outro país (47 é a Noruega)', () => {
    expect(storeWhatsapp({ storePhone: '47999990000' })).toBe('https://wa.me/5547999990000');
    expect(storeWhatsapp({ storePhone: '4733330000' })).toBe('https://wa.me/554733330000');
  });
  it('link que não é do WhatsApp (até javascript:) cai no número', () => {
    expect(storeWhatsapp({ whatsappUrl: 'javascript:alert(1)', storePhone: '47999990000' })).toBe('https://wa.me/5547999990000');
    expect(storeWhatsapp({ whatsappUrl: 'https://evil.com/wa.me/1', storePhone: '47999990000' })).toBe('https://wa.me/5547999990000');
  });
  it('ignora link que não é do WhatsApp e número curto', () => {
    expect(storeWhatsapp({ whatsappUrl: 'https://exemplo.com', storePhone: '' })).toBeNull();
    expect(storeWhatsapp({ storePhone: '1234' })).toBeNull();
  });
  it('coloca a mensagem pronta', () => {
    expect(whatsappWithText('https://wa.me/5547999990000', 'Olá! Jogo Casal')).toBe('https://wa.me/5547999990000?text=Ol%C3%A1%21+Jogo+Casal');
  });
});
