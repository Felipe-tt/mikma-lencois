import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const resolveMx = vi.fn();
const resolve4 = vi.fn();
const resolve6 = vi.fn();
vi.mock('node:dns', () => ({ promises: { resolveMx: (d: string) => resolveMx(d), resolve4: (d: string) => resolve4(d), resolve6: (d: string) => resolve6(d) } }));

const load = async () => (await import('./emailDeliverability')).checkEmailDeliverability;
const dnsErr = (code: string) => Object.assign(new Error(code), { code });

describe('checkEmailDeliverability', () => {
  beforeEach(() => {
    vi.resetModules();
    resolveMx.mockReset(); resolve4.mockReset(); resolve6.mockReset();
    resolve4.mockResolvedValue([]); resolve6.mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());

  it('aceita dominio com MX', async () => {
    resolveMx.mockResolvedValue([{ exchange: 'mx.exemplo.com', priority: 10 }]);
    expect(await (await load())('a@exemplo-real.com')).toEqual({ ok: true });
  });

  it('rejeita provedor de e-mail descartavel sem consultar DNS', async () => {
    const r = await (await load())('a@mailinator.com');
    expect(r.ok).toBe(false);
    expect(resolveMx).not.toHaveBeenCalled();
  });

  it('rejeita dominio inexistente (sem MX, A ou AAAA)', async () => {
    resolveMx.mockRejectedValue(dnsErr('ENOTFOUND'));
    const r = await (await load())('a@dominio-que-nao-existe-xyz.com');
    expect(r.ok).toBe(false);
  });

  it('usa A/AAAA como fallback quando nao ha MX (RFC 5321)', async () => {
    resolveMx.mockRejectedValue(dnsErr('ENODATA'));
    resolve4.mockResolvedValue(['203.0.113.10']);
    expect((await (await load())('a@so-tem-a.com')).ok).toBe(true);
  });

  it('rejeita Null MX (RFC 7505)', async () => {
    resolveMx.mockResolvedValue([{ exchange: '', priority: 0 }]);
    expect((await (await load())('a@nao-recebe.com')).ok).toBe(false);
  });

  it('falha aberto em erro de DNS temporario', async () => {
    resolveMx.mockRejectedValue(dnsErr('ESERVFAIL'));
    expect((await (await load())('a@qualquer.com')).ok).toBe(true);
  });
});
