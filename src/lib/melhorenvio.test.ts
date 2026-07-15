import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  meDispatch,
  meBalance,
  meCancel,
  ME_SERVICES,
  type MEAddress,
  type MEProduct,
  type MEPackage,
} from './melhorenvio';

const FROM: MEAddress = {
  name: 'Mikma Lençóis',
  phone: '47999999999',
  email: 'contato@mikma.com.br',
  document: '00000000000',
  address: 'Rua Bernhard Koser',
  number: '105',
  district: 'Salto Weissbach',
  city: 'Blumenau',
  country_id: 'BR',
  postal_code: '89032143',
  state_abbr: 'SC',
};

const TO: MEAddress = {
  ...FROM,
  name: 'Felipe Ittner',
  document: '11111111111',
  address: 'Rua Exemplo',
  number: '10',
};

const PRODUCTS: MEProduct[] = [{ name: 'Jogo Queen', quantity: 1, unitary_value: 103 }];
const VOLUMES: MEPackage[] = [{ weight: 1.22, width: 25, height: 10, length: 35 }];

// Sequência de respostas simuladas do Melhor Envio pro fluxo completo de
// despacho: cart -> checkout -> generate -> print -> tracking.
function mockMeFlow(opts: { tracking?: string | null } = {}) {
  const calls: { url: string; body: unknown }[] = [];

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, body });

    if (url.endsWith('/me/cart')) {
      return jsonResponse({ id: 'cart-item-123', protocol: 'PROTO123', service_id: body.service });
    }
    if (url.endsWith('/me/shipment/checkout')) {
      return jsonResponse({ purchase: { id: 'purchase-1' } });
    }
    if (url.endsWith('/me/shipment/generate')) {
      return jsonResponse({});
    }
    if (url.endsWith('/me/shipment/print')) {
      return jsonResponse({ url: 'https://melhorenvio.com.br/etiqueta/cart-item-123.pdf' });
    }
    if (url.includes('/me/shipment/tracking')) {
      return jsonResponse([
        {
          id: 'cart-item-123',
          protocol: 'PROTO123',
          status: 'released',
          tracking: opts.tracking === undefined ? 'AA123456789BR' : opts.tracking,
          tracking_url: null,
        },
      ]);
    }
    throw new Error(`unexpected fetch to ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

function jsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(data),
  } as Response;
}

beforeEach(() => {
  vi.stubEnv('MELHOR_ENVIO_TOKEN', 'fake-token');
  vi.stubEnv('MELHOR_ENVIO_SANDBOX', 'true');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('ME_SERVICES — mapeamento de transportadoras', () => {
  it('tem o service_id certo pra cada transportadora suportada', () => {
    expect(ME_SERVICES.correios_pac).toBe(1);
    expect(ME_SERVICES.correios_sedex).toBe(2);
    expect(ME_SERVICES.jadlog_package).toBe(7);
    expect(ME_SERVICES.jadlog_expresso).toBe(18);
  });
});

describe('meDispatch — despacho completo por transportadora', () => {
  const carriers: Array<keyof typeof ME_SERVICES> = [
    'correios_pac',
    'correios_sedex',
    'jadlog_package',
    'jadlog_expresso',
  ];

  for (const carrier of carriers) {
    it(`despacha corretamente via ${carrier}`, async () => {
      const { calls } = mockMeFlow();

      const result = await meDispatch({
        serviceId: ME_SERVICES[carrier],
        orderId: 'order-abc',
        from: FROM,
        to: TO,
        products: PRODUCTS,
        volumes: VOLUMES,
        insuranceValue: 103,
      });

      // Retorno esperado independente da transportadora.
      expect(result.meOrderId).toBe('cart-item-123');
      expect(result.trackingCode).toBe('AA123456789BR');
      expect(result.labelUrl).toBe('https://melhorenvio.com.br/etiqueta/cart-item-123.pdf');

      // O carrinho foi montado com o service_id certo pra essa transportadora.
      const cartCall = calls.find(c => c.url.endsWith('/me/cart'));
      expect(cartCall?.body).toMatchObject({
        service: ME_SERVICES[carrier],
        from: FROM,
        to: TO,
        products: PRODUCTS,
        volumes: VOLUMES,
        options: expect.objectContaining({
          insurance_value: 103,
          tags: [{ tag: 'order-abc', url: null }],
        }),
      });

      // Checkout, generate e print foram chamados na ordem certa com o id do carrinho.
      const checkoutCall = calls.find(c => c.url.endsWith('/me/shipment/checkout'));
      expect(checkoutCall?.body).toEqual({ orders: ['cart-item-123'] });

      const generateCall = calls.find(c => c.url.endsWith('/me/shipment/generate'));
      expect(generateCall?.body).toEqual({ orders: ['cart-item-123'] });

      const printCall = calls.find(c => c.url.endsWith('/me/shipment/print'));
      expect(printCall?.body).toEqual({ orders: ['cart-item-123'], mode: 'public' });
    });
  }

  it('segue retornando a etiqueta mesmo se o rastreio ainda não estiver disponível', async () => {
    mockMeFlow({ tracking: null });

    const result = await meDispatch({
      serviceId: ME_SERVICES.correios_sedex,
      orderId: 'order-sem-rastreio',
      from: FROM,
      to: TO,
      products: PRODUCTS,
      volumes: VOLUMES,
      insuranceValue: 103,
    });

    expect(result.labelUrl).toBe('https://melhorenvio.com.br/etiqueta/cart-item-123.pdf');
    expect(result.trackingCode).toBeNull();
  });

  it('não deixa o despacho falhar se a chamada de rastreio der erro', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      if (url.endsWith('/me/cart')) return jsonResponse({ id: 'cart-item-999', protocol: 'P', service_id: body.service });
      if (url.endsWith('/me/shipment/checkout')) return jsonResponse({ purchase: { id: 'p1' } });
      if (url.endsWith('/me/shipment/generate')) return jsonResponse({});
      if (url.endsWith('/me/shipment/print')) return jsonResponse({ url: 'https://melhorenvio.com.br/etiqueta/cart-item-999.pdf' });
      if (url.includes('/me/shipment/tracking')) {
        return { ok: false, status: 500, text: async () => 'erro interno' } as Response;
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await meDispatch({
      serviceId: ME_SERVICES.jadlog_package,
      orderId: 'order-tracking-falho',
      from: FROM,
      to: TO,
      products: PRODUCTS,
      volumes: VOLUMES,
      insuranceValue: 103,
    });

    // Etiqueta e compra já aconteceram — não podemos perder isso por causa
    // do rastreio, que pode demorar a ficar disponível na ME.
    expect(result.labelUrl).toBe('https://melhorenvio.com.br/etiqueta/cart-item-999.pdf');
    expect(result.trackingCode).toBeNull();
  });

  it('propaga o erro se a compra do envio falhar (ex: saldo insuficiente na ME)', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/me/cart')) return jsonResponse({ id: 'cart-item-1', protocol: 'P', service_id: 1 });
      if (url.endsWith('/me/shipment/checkout')) {
        return { ok: false, status: 422, text: async () => 'Saldo insuficiente' } as Response;
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      meDispatch({
        serviceId: ME_SERVICES.correios_pac,
        orderId: 'order-sem-saldo',
        from: FROM,
        to: TO,
        products: PRODUCTS,
        volumes: VOLUMES,
        insuranceValue: 103,
      })
    ).rejects.toThrow(/422/);
  });
});

describe('meBalance', () => {
  it('converte o saldo de reais pra centavos', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ balance: 152.5 })));
    await expect(meBalance()).resolves.toBe(15250);
  });

  it('trata saldo ausente na resposta como zero', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    await expect(meBalance()).resolves.toBe(0);
  });
});

describe('meCancel', () => {
  it('envia o motivo de cancelamento truncado em 255 caracteres', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string);
      expect(body.order).toEqual({ id: 'me-order-1' });
      expect(body.description.length).toBeLessThanOrEqual(255);
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    const longReason = 'x'.repeat(400);
    await meCancel('me-order-1', longReason);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
