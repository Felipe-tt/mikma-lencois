import { describe, it, expect } from 'vitest';
import { buildRefunded } from './orderStatusEmails';

describe('buildRefunded', () => {
  it('avisa o valor devolvido e como ele volta, por meio de pagamento', () => {
    const card = buildRefunded({ id: 'ord_abcdef1234567890', totalCents: 25990 }, 'Ana', 'card');
    expect(card.subject).toContain('estornado');
    expect(card.text).toContain('R$');
    expect(card.text).toContain('259,90');
    expect(card.text).toContain('fatura');
    expect(buildRefunded({ id: 'ord_x', totalCents: 100 }, 'Ana', 'pix').text).toContain('PIX');
    expect(buildRefunded({ id: 'ord_x', totalCents: 100 }, 'Ana', 'outro').text).toContain('mesmo meio');
  });
  it('escapa o nome no HTML', () => {
    expect(buildRefunded({ id: 'ord_x', totalCents: 100 }, '<b>x</b>', 'pix').html).not.toContain('<b>x</b>');
  });
});
