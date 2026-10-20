import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/firebase/admin', () => ({ adminDb: {} }));
import { restockRequestId, restockEmail } from './restockRequests';

describe('restockRequestId', () => {
  it('é o mesmo para a mesma variação e e-mail, sem diferença de caixa ou espaço', () => {
    expect(restockRequestId('p1', 'v1', ' Maria@Exemplo.com ')).toBe(restockRequestId('p1', 'v1', 'maria@exemplo.com'));
  });
  it('muda com o produto e com a variação', () => {
    expect(restockRequestId('p1', 'v1', 'a@b.com')).not.toBe(restockRequestId('p2', 'v1', 'a@b.com'));
    expect(restockRequestId('p1', 'v1', 'a@b.com')).not.toBe(restockRequestId('p1', 'v2', 'a@b.com'));
  });
});

describe('restockEmail', () => {
  it('escapa o nome, cita a variação e leva o link', () => {
    const { subject, html, text } = restockEmail('Jogo <King>', 'King · Salmão', 'https://mikma.com.br/produtos/p1');
    expect(subject).toBe('Voltou ao estoque: Jogo <King> (King · Salmão)');
    expect(html).toContain('Jogo &lt;King&gt; (King · Salmão)');
    expect(html).not.toContain('<King>');
    expect(html).toContain('https://mikma.com.br/produtos/p1');
    expect(text).toContain('https://mikma.com.br/produtos/p1');
  });
});
