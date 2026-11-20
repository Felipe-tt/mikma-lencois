import { describe, expect, it } from 'vitest';
import { stripQuotedHtml } from './stripQuoted';

describe('histórico citado do e-mail recebido', () => {
  it('tira blockquote, citação do Gmail e do Outlook', () => {
    expect(stripQuotedHtml('<p>Oi</p><blockquote type="cite">antes</blockquote>')).toBe('<p>Oi</p>');
    expect(stripQuotedHtml('<p>Oi</p><div class="gmail_quote gmail_quote_container">Em ter, X escreveu</div>')).toBe('<p>Oi</p>');
    expect(stripQuotedHtml('<p>Oi</p><DIV id="divRplyFwdMsg">De: X</DIV>')).toBe('<p>Oi</p>');
    expect(stripQuotedHtml('<p>Oi</p><div\nid="appendonsend"></div>')).toBe('<p>Oi</p>');
    expect(stripQuotedHtml('<p>Oi</p><hr style="x"><p>De: X</p>')).toBe('<p>Oi</p><p>De: X</p>');
  });

  it('mantém div comum e o que não fecha', () => {
    expect(stripQuotedHtml('<div class="msg">Oi</div>')).toBe('<div class="msg">Oi</div>');
    expect(stripQuotedHtml('<div data-class="gmail_quote">Oi</div>')).toBe('<div data-class="gmail_quote">Oi</div>');
    expect(stripQuotedHtml('<p>Oi</p><blockquote>sem fim')).toBe('<p>Oi</p><blockquote>sem fim');
    expect(stripQuotedHtml('<divider>Oi</divider>')).toBe('<divider>Oi</divider>');
  });

  it('junta quebras de linha que sobram', () => {
    expect(stripQuotedHtml('Oi<br><br/><br >\n<br>tchau')).toBe('Oi<br><br>tchau');
  });

  it('caracteres que mudam de tamanho em minúsculas não desalinham o corte', () => {
    expect(stripQuotedHtml('<p>İİİ</p><blockquote>x</blockquote><p>ok</p>')).toBe('<p>İİİ</p><p>ok</p>');
  });

  it('HTML malicioso responde rápido', () => {
    const t = Date.now();
    stripQuotedHtml('<blockquote'.repeat(50_000));
    stripQuotedHtml('<div class="gmail_quote"'.repeat(20_000));
    stripQuotedHtml('<hr'.repeat(100_000));
    expect(Date.now() - t).toBeLessThan(500);
  });
});
