import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { checkPassword } from './password';

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex').toUpperCase();

function mockHibp(leaked: string[] = []) {
  const suffixes = new Map<string, string[]>();
  for (const p of leaked) {
    const h = sha1(p);
    suffixes.set(h.slice(0, 5), [...(suffixes.get(h.slice(0, 5)) ?? []), `${h.slice(5)}:1234`]);
  }
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const prefix = String(input).split('/range/')[1];
    const lines = [...(suffixes.get(prefix) ?? []), '0000000000000000000000000000000000A:0'];
    return new Response(lines.join('\r\n'), { status: 200 });
  });
}

describe('checkPassword', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { spy = mockHibp(['Xk7!Qm2$vL9pRt']); });
  afterEach(() => spy.mockRestore());

  it('exige tamanho minimo e maximo', async () => {
    expect((await checkPassword('')).ok).toBe(false);
    expect((await checkPassword('abc123')).ok).toBe(false);
    expect((await checkPassword('a'.repeat(129))).ok).toBe(false);
  });

  it('NAO impoe regras de composicao (NIST): frase longa so com letras passa', async () => {
    const r = await checkPassword('cavalo azul dança sobre pedras');
    expect(r.ok).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(3);
  });

  it('recusa senhas triviais e comuns', async () => {
    for (const p of ['12345678', 'password', 'senha123', 'qwertyuiop', 'aaaaaaaa', 'brasil2024']) {
      expect((await checkPassword(p)).ok, p).toBe(false);
    }
  });

  it('recusa senha que aparece em vazamentos (HIBP) e envia so 5 chars do hash', async () => {
    const r = await checkPassword('Xk7!Qm2$vL9pRt');
    expect(r.ok).toBe(false);
    expect(r.pwned).toBe(true);
    const urls = spy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) {
      expect(u).toMatch(/\/range\/[0-9A-F]{5}$/);
      expect(u).not.toContain('Xk7');
    }
  });

  it('aceita senha forte que nao esta vazada', async () => {
    const r = await checkPassword('Tr0ca-Mesa-Nuvem-Pinheiro-47');
    expect(r.ok).toBe(true);
    expect(r.pwned).toBe(false);
  });

  it('recusa senha baseada no e-mail ou nome', async () => {
    const r = await checkPassword('mariasilva2024', { email: 'maria.silva@gmail.com', name: 'Maria Silva' });
    expect(r.ok).toBe(false);
  });

  it('passphrase muito forte pode conter parte do nome', async () => {
    const r = await checkPassword('rosa-cavalo-nuvem-pedra-lanterna-47', { name: 'Rosa Lima', email: 'rosa@gmail.com' });
    expect(r.ok).toBe(true);
  });

  it('falha aberto se o HIBP estiver fora do ar', async () => {
    spy.mockRestore();
    spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const r = await checkPassword('Tr0ca-Mesa-Nuvem-Pinheiro-47');
    expect(r.ok).toBe(true);
  });
});
