import { describe, it, expect } from 'vitest';
import { escapeHtml, serializeJsonLd, sanitizeDisplayName } from './html';

describe('escapeHtml', () => {
  it('escapa os caracteres que abrem tags e atributos', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });
  it('trata null/undefined/número sem quebrar', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(42)).toBe('42');
  });
  it('payload de phishing no nome vira texto inerte', () => {
    const out = escapeHtml('<a/href=//evil.tld>Verifique</a>');
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
  });
});

describe('serializeJsonLd (XSS armazenado via avaliações)', () => {
  const payload = '</script><img src=x onerror=window.__pwned=1>';

  it('não deixa </script> sair do contexto do script', () => {
    const out = serializeJsonLd({ review: [{ reviewBody: payload, author: { name: payload } }] });
    expect(out).not.toContain('</script');
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
  });

  it('continua sendo JSON válido e preserva o conteúdo original ao ler', () => {
    const data = { review: [{ reviewBody: payload, n: 'a & b', sep: 'x\u2028y' }] };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });
});

describe('sanitizeDisplayName', () => {
  it('remove < > e caracteres de controle, normaliza espaços e limita tamanho', () => {
    expect(sanitizeDisplayName('  <b>Maria</b>\n\t da   Silva ')).toBe('bMaria/b da Silva');
    expect(sanitizeDisplayName('A'.repeat(300))).toHaveLength(100);
  });
  it('preserva nomes com acento, apóstrofo, hífen e ponto', () => {
    expect(sanitizeDisplayName("João-Pedro D'Ávila Jr.")).toBe("João-Pedro D'Ávila Jr.");
  });
  it('vazio vira string vazia (o chamador usa fallback)', () => {
    expect(sanitizeDisplayName(undefined)).toBe('');
    expect(sanitizeDisplayName('<>')).toBe('');
  });
});
