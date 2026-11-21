import { describe, expect, it } from 'vitest';
import { attachmentLabel, attachmentPath, isInlineImage } from './attachments';

describe('anexos de e-mail', () => {
  it('só imagem comum abre na conversa; SVG e o resto baixam', () => {
    expect(isInlineImage('image/jpeg')).toBe(true);
    expect(isInlineImage('image/PNG')).toBe(true);
    expect(isInlineImage('image/webp; name=a.webp')).toBe(true);
    expect(isInlineImage('image/svg+xml')).toBe(false);
    expect(isInlineImage('text/html')).toBe(false);
    expect(isInlineImage('application/pdf')).toBe(false);
  });

  it('acha o caminho no Storage, no novo e no antigo (URL pública)', () => {
    expect(attachmentPath({ path: 'email-attachments/e1/1_a.pdf' })).toBe('email-attachments/e1/1_a.pdf');
    expect(attachmentPath({ url: 'https://storage.googleapis.com/mikma.appspot.com/email-attachments/e1/1_a.pdf' }))
      .toBe('email-attachments/e1/1_a.pdf');
  });

  it('não aceita outro lugar do bucket nem outro site', () => {
    expect(attachmentPath({ path: 'products/p1/foto.webp' })).toBeNull();
    expect(attachmentPath({ path: 'email-attachments/../products/x' })).toBeNull();
    expect(attachmentPath({ url: 'https://evil.com/email-attachments/e1/a.pdf' })).toBeNull();
    expect(attachmentPath({ url: 'https://storage.googleapis.com/b/returns/u1/1.jpg' })).toBeNull();
    expect(attachmentPath({})).toBeNull();
  });

  it('nome sem caractere que inverte o texto e disfarça a extensão', () => {
    expect(attachmentLabel('fatura\u202Efdp.exe')).toBe('faturafdp.exe');
    expect(attachmentLabel('a\u200B\u2066b\u2069.pdf')).toBe('ab.pdf');
    expect(attachmentLabel('  ')).toBe('anexo');
    expect(attachmentLabel(undefined)).toBe('anexo');
    expect(attachmentLabel('x'.repeat(300))).toHaveLength(120);
  });
});
