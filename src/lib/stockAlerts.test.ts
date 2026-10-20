import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/firebase/admin', () => ({ adminDb: {} }));
import { stockAlertId, stockAlertEmail } from './stockAlerts';

describe('stockAlertId', () => {
  it('é o mesmo para o mesmo produto e e-mail, sem diferença de caixa ou espaço', () => {
    expect(stockAlertId('p1', ' Maria@Exemplo.com ')).toBe(stockAlertId('p1', 'maria@exemplo.com'));
  });
  it('muda com o produto', () => {
    expect(stockAlertId('p1', 'a@b.com')).not.toBe(stockAlertId('p2', 'a@b.com'));
  });
});

describe('stockAlertEmail', () => {
  it('escapa o nome do produto no HTML e leva o link', () => {
    const { subject, html, text } = stockAlertEmail('Jogo <King>', 'https://mikma.com.br/produtos/p1');
    expect(subject).toBe('Voltou ao estoque: Jogo <King>');
    expect(html).toContain('Jogo &lt;King&gt;');
    expect(html).not.toContain('<King>');
    expect(html).toContain('https://mikma.com.br/produtos/p1');
    expect(text).toContain('https://mikma.com.br/produtos/p1');
  });
});
