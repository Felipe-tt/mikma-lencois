import { describe, it, expect } from 'vitest';
import { googleUrl, isGoogleUrl } from './googleProfile';

describe('links do perfil no Google', () => {
  it('aceita os links que o Google dá para avaliar e compartilhar', () => {
    for (const u of [
      'https://g.page/r/CQx1abc/review',
      'https://maps.app.goo.gl/AbCdEf123',
      'https://www.google.com/maps/place/Mikma',
      'https://search.google.com/local/writereview?placeid=abc',
      'https://www.google.com.br/maps/place/Mikma',
    ]) expect(isGoogleUrl(u)).toBe(true);
  });

  it('recusa link que não é do Google ou sem https', () => {
    for (const u of ['http://g.page/r/abc', 'https://g.page.evil.com/r', 'https://evilgoogle.com/x', 'https://google.evil.com/x', 'https://maps.google.com.evil.io/x', 'javascript:alert(1)', '', 'mikma']) {
      expect(isGoogleUrl(u)).toBe(false);
    }
    expect(googleUrl('https://exemplo.com')).toBe('');
    expect(googleUrl(' https://g.page/r/abc ')).toBe('https://g.page/r/abc');
  });
});
