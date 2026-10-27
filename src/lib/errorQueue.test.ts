import { describe, it, expect, vi } from 'vitest';

describe('errorQueue', () => {
  it('guarda erros até o Sentry iniciar e depois manda direto', async () => {
    vi.resetModules();
    const { reportError, flushErrors } = await import('./errorQueue');
    reportError('a'); reportError('b');
    const sent: unknown[] = [];
    flushErrors(e => sent.push(e));
    expect(sent).toEqual(['a', 'b']);
    reportError('c');
    expect(sent).toEqual(['a', 'b', 'c']);
  });

  it('limita a fila a 20 erros', async () => {
    vi.resetModules();
    const { reportError, flushErrors } = await import('./errorQueue');
    for (let i = 0; i < 50; i++) reportError(i);
    const sent: unknown[] = [];
    flushErrors(e => sent.push(e));
    expect(sent).toHaveLength(20);
  });
});
