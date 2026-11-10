import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/firebase/admin', () => ({ adminDb: {} }));
vi.mock('@/lib/uber-direct', () => ({}));

import { assignRelativeTags, computeShippingOptions, packageFor, type ShippingOption } from './shipping-pricing';
import { resetCorreiosToken } from './correiosContrato';
import type { StoreSettings } from './store-settings';

const opt = (carrier: string, priceCents: number, estimatedDays: number, tag?: ShippingOption['tag']): ShippingOption =>
  ({ carrier, label: carrier, priceCents, realPriceCents: priceCents, estimatedDays, available: true, tag } as ShippingOption);

describe('assignRelativeTags', () => {
  it('marca só a mais barata como econômica e a mais rápida como rápida', () => {
    const out = assignRelativeTags([
      opt('pickup', 0, 0, 'local'),
      opt('correios_pac', 2500, 10, 'economico'),
      opt('correios_sedex', 4500, 3, 'rapido'),
      opt('jadlog_package', 3200, 5, 'economico'),
    ]);
    expect(out.map(o => o.tag)).toEqual(['local', 'economico', 'rapido', undefined]);
  });

  it('com uma transportadora só, ela fica sem tag', () => {
    const out = assignRelativeTags([opt('pickup', 0, 0, 'local'), opt('jadlog_package', 3200, 5, 'economico')]);
    expect(out.map(o => o.tag)).toEqual(['local', undefined]);
  });

  it('quando a mais barata também é a mais rápida, fica só econômica', () => {
    const out = assignRelativeTags([opt('a', 2000, 2), opt('b', 3000, 4)]);
    expect(out.map(o => o.tag)).toEqual(['economico', undefined]);
  });

  it('com frete grátis usa o preço real pra decidir', () => {
    const a = { ...opt('a', 0, 10), realPriceCents: 2500 };
    const b = { ...opt('b', 0, 3), realPriceCents: 4500 };
    expect(assignRelativeTags([b, a]).map(o => o.tag)).toEqual(['rapido', 'economico']);
  });
});

describe('packageFor', () => {
  it('escolhe a caixa pelo peso', () => {
    expect(packageFor(1.5)).toEqual({ weightKg: 1.5, lengthCm: 30, widthCm: 25, heightCm: 10 });
    expect(packageFor(3)).toMatchObject({ lengthCm: 40, widthCm: 30, heightCm: 15 });
    expect(packageFor(8)).toMatchObject({ lengthCm: 50, widthCm: 40, heightCm: 20 });
  });
});

describe('computeShippingOptions: contrato dos Correios e Melhor Envio', () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const settings = { originCep: '89042300', originLat: -26.87, originLng: -49.08, localDeliveryRadiusKm: 10, freeShippingThresholdCents: 0, freeShippingMaxLossCents: 0 } as StoreSettings;
  const melhorEnvio = [
    { id: 1, name: 'PAC', price: '27.50', custom_price: '27.50', delivery_time: 7, custom_delivery_time: 7 },
    { id: 2, name: 'SEDEX', price: '41.80', custom_price: '41.80', delivery_time: 3, custom_delivery_time: 3 },
    { id: 7, name: '.Package', price: '29.90', custom_price: '29.90', delivery_time: 6, custom_delivery_time: 6 },
  ];

  /** Simula as APIs: `correios` decide o que o contrato responde em preço e prazo. */
  function stubApis(correios: (kind: 'preco' | 'prazo', servico: string) => Response) {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes('viacep.com.br')) return json({ erro: true });
      if (url.includes('/token/v1/autentica/cartaopostagem')) return json({ token: 't', expiraEm: '2099-01-01T10:00:00', cartaoPostagem: { contrato: '9912490489', dr: 68 } }, 201);
      const m = url.match(/api\.correios\.com\.br\/(preco|prazo)\/v1\/nacional\/(\d{5})/);
      if (m) return correios(m[1] as 'preco' | 'prazo', m[2]);
      if (url.includes('melhorenvio.com.br')) return json(melhorEnvio);
      throw new Error(`chamada não simulada: ${url}`);
    }));
  }
  const contratoOk = (kind: 'preco' | 'prazo', servico: string) =>
    kind === 'preco' ? json({ pcFinal: servico === '03298' ? '24,07' : '37,69' }) : json({ prazoEntrega: servico === '03298' ? 5 : 1 });
  const summary = (options: ShippingOption[]) => options.map(o => [o.carrier, o.priceCents, o.estimatedDays, o.tag]);

  beforeEach(() => {
    resetCorreiosToken();
    vi.stubEnv('CORREIOS_CWS', 'loja:codigo');
    vi.stubEnv('CORREIOS_CARTAO', '0075520150');
    vi.stubEnv('MELHOR_ENVIO_TOKEN', 'token');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('PAC e SEDEX saem do contrato; a Jadlog continua vindo do Melhor Envio', async () => {
    stubApis(contratoOk);
    const { options, isLocal } = await computeShippingOptions('01310100', settings, 39990, 1.5);
    expect(isLocal).toBe(false);
    expect(summary(options)).toEqual([
      ['correios_pac', 2407, 5, 'economico'],
      ['jadlog_package', 2990, 6, undefined],
      ['correios_sedex', 3769, 1, 'rapido'],
    ]);
  });

  it('contrato fora do ar: PAC e SEDEX vêm do Melhor Envio e a venda continua', async () => {
    stubApis(() => json({ msgs: ['indisponível'] }, 503));
    const { options } = await computeShippingOptions('01310100', settings, 39990, 1.5);
    expect(summary(options)).toEqual([
      ['correios_pac', 2750, 7, 'economico'],
      ['jadlog_package', 2990, 6, undefined],
      ['correios_sedex', 4180, 3, 'rapido'],
    ]);
  });

  it('contrato só respondeu o PAC: o SEDEX vem do Melhor Envio', async () => {
    stubApis((kind, servico) => (servico === '03220' ? json({ msgs: ['erro'] }, 500) : contratoOk(kind, servico)));
    const { options } = await computeShippingOptions('01310100', settings, 39990, 1.5);
    expect(summary(options)).toEqual([
      ['correios_pac', 2407, 5, 'economico'],
      ['jadlog_package', 2990, 6, undefined],
      ['correios_sedex', 4180, 3, 'rapido'],
    ]);
  });

  it('prazo fora do ar não derruba o preço do contrato', async () => {
    stubApis((kind, servico) => (kind === 'prazo' ? json({}, 503) : contratoOk(kind, servico)));
    const { options } = await computeShippingOptions('01310100', settings, 39990, 1.5);
    expect(options.find(o => o.carrier === 'correios_pac')).toMatchObject({ priceCents: 2407, estimatedDays: 10 });
    expect(options.find(o => o.carrier === 'correios_sedex')).toMatchObject({ priceCents: 3769, estimatedDays: 3 });
  });

  it('frete grátis zera o preço do cliente e guarda o custo do contrato', async () => {
    stubApis(contratoOk);
    const { options, freeShipping } = await computeShippingOptions('01310100', { ...settings, freeShippingThresholdCents: 30000 }, 39990, 1.5);
    expect(freeShipping).toBe(true);
    expect(options.find(o => o.carrier === 'correios_pac')).toMatchObject({ priceCents: 0, realPriceCents: 2407 });
    expect(options.find(o => o.carrier === 'correios_sedex')).toMatchObject({ priceCents: 0, realPriceCents: 3769 });
  });

  it('manda ao contrato a caixa do peso do pedido, não a caixa grande', async () => {
    stubApis(contratoOk);
    await computeShippingOptions('01310100', settings, 39990, 1.5);
    const preco = vi.mocked(fetch).mock.calls.map(c => String(c[0])).find(u => u.includes('/preco/'))!;
    const q = new URL(preco).searchParams;
    expect([q.get('psObjeto'), q.get('comprimento'), q.get('largura'), q.get('altura')]).toEqual(['1500', '30', '25', '10']);
    expect([q.get('cepOrigem'), q.get('cepDestino')]).toEqual(['89042300', '01310100']);
  });
});
