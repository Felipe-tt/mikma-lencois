import { describe, expect, it } from 'vitest';
import { buildTrocaEmail } from './returnEmails';

const base = { type: 'troca' as const, orderId: 'ord_abc12345xyz98765', name: 'Ana' };

describe('buildTrocaEmail', () => {
  it('aprovada com código: mostra o código e o prazo para postar', () => {
    const m = buildTrocaEmail({ ...base, kind: 'aprovada', reversa: { codigoObjeto: 'LR123456789BR', validade: '2026-11-26' } });
    expect(m.subject).toMatch(/^Troca aprovada, pedido #XYZ98765/);
    expect(m.html).toContain('LR123456789BR');
    expect(m.html).toContain('26/11');
    expect(m.text).toContain('LR123456789BR');
  });

  it('aprovada sem código: avisa que o código vem em seguida', () => {
    const m = buildTrocaEmail({ ...base, kind: 'aprovada' });
    expect(m.text).toMatch(/em seguida/i);
    expect(m.html).not.toContain('Código de postagem');
  });

  it('devolução recusada e concluída usam a palavra certa', () => {
    expect(buildTrocaEmail({ ...base, type: 'devolucao', kind: 'recusada' }).subject).toMatch(/sua devolução/);
    expect(buildTrocaEmail({ ...base, type: 'devolucao', kind: 'concluida' }).html).toMatch(/mesmo meio de pagamento/);
  });

  it('chegou: avisa que a loja vai conferir', () => {
    const m = buildTrocaEmail({ ...base, kind: 'chegou' });
    expect(m.subject).toMatch(/^Recebemos as peças da sua troca/);
    expect(m.text).toMatch(/conferir/);
  });

  it('escapa o nome do cliente', () => {
    expect(buildTrocaEmail({ ...base, name: '<b>x', kind: 'concluida' }).html).not.toContain('<b>x');
  });
});
