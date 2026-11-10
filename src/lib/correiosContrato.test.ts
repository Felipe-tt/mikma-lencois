import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseReais, quoteCorreiosContrato, resetCorreiosToken } from './correiosContrato';

const pkg = { weightKg: 1.5, heightCm: 20, widthCm: 40, lengthCm: 50 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('parseReais', () => {
  it('lê vírgula decimal e milhar', () => {
    expect(parseReais('24,07')).toBe(2407);
    expect(parseReais('1.024,50')).toBe(102450);
    expect(parseReais('37.69')).toBe(3769);
    expect(parseReais(12.3)).toBe(1230);
    expect(parseReais(undefined)).toBe(0);
  });
});

describe('quoteCorreiosContrato', () => {
  beforeEach(() => {
    resetCorreiosToken();
    vi.stubEnv('CORREIOS_CWS', 'loja:codigo');
    vi.stubEnv('CORREIOS_CARTAO', '0075520150');
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('sem credencial não chama a API', async () => {
    vi.stubEnv('CORREIOS_CWS', '');
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await quoteCorreiosContrato('89042300', '01310100', pkg)).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it('cota PAC e SEDEX com contrato e DR do token, e reaproveita o token', async () => {
    const urls: string[] = [];
    const f = vi.fn(async (url: string) => {
      urls.push(url);
      if (url.includes('/token/')) return json({ token: 't', expiraEm: '2099-01-01T10:00:00', cartaoPostagem: { contrato: '9912490489', dr: 68 } }, 201);
      if (url.includes('/preco/')) return json({ pcFinal: url.includes('03298') ? '24,07' : '37,69' });
      return json({ prazoEntrega: url.includes('03298') ? 5 : 1 });
    });
    vi.stubGlobal('fetch', f);
    const out = await quoteCorreiosContrato('89042-300', '01310-100', pkg);
    expect(out).toEqual([
      { carrier: 'correios_pac', label: 'Correios PAC', priceCents: 2407, estimatedDays: 5, available: true },
      { carrier: 'correios_sedex', label: 'Correios SEDEX', priceCents: 3769, estimatedDays: 1, available: true },
    ]);
    const preco = urls.find(u => u.includes('/preco/'))!;
    expect(preco).toContain('nuContrato=9912490489');
    expect(preco).toContain('nuDR=68');
    expect(preco).toContain('psObjeto=1500');
    await quoteCorreiosContrato('89042300', '01310100', pkg);
    expect(urls.filter(u => u.includes('/token/'))).toHaveLength(1);
  });

  it('token recusado devolve lista vazia', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 401)));
    expect(await quoteCorreiosContrato('89042300', '01310100', pkg)).toEqual([]);
  });

  it('serviço com erro de preço fica de fora', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/token/')) return json({ token: 't', expiraEm: '2099-01-01T10:00:00', cartaoPostagem: { contrato: '1', dr: 1 } }, 201);
      if (url.includes('/preco/')) return url.includes('03220') ? json({ msgs: ['erro'] }, 400) : json({ pcFinal: '30,00' });
      return json({ prazoEntrega: 4 });
    }));
    const out = await quoteCorreiosContrato('89042300', '69005000', pkg);
    expect(out.map(o => o.carrier)).toEqual(['correios_pac']);
  });
});
