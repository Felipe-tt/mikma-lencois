import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ token: 't', expiresAt: Date.now() + 3_600_000 }) }), set: async () => {} }) }) },
}));

process.env.UBER_DIRECT_SANDBOX_CREDS = JSON.stringify({ clientId: 'c', clientSecret: 's', customerId: 'cust' });
const { uberCreateDelivery } = await import('./uber-direct');

const base = {
  orderId: 'ord_1', pickupName: 'Loja', pickupAddress: '{}', pickupPhoneNumber: '+5547999999999',
  dropoffName: 'Cliente', dropoffAddress: '{}', dropoffPhoneNumber: '+5547988888888', manifestItems: [{ name: 'Jogo', quantity: 1 }],
};

describe('uberCreateDelivery: chave por tentativa', () => {
  afterEach(() => vi.unstubAllGlobals());
  async function corpo(attempt?: number) {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'del_1', tracking_url: 'u', fee: 1000, status: 'pending' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await uberCreateDelivery({ ...base, attempt }, true);
    return JSON.parse((fetchMock.mock.calls.at(-1) as unknown as [string, { body: string }])[1].body);
  }
  it('primeira corrida usa o id do pedido', async () => {
    expect(await corpo()).toMatchObject({ idempotency_key: 'ord_1', external_id: 'ord_1', manifest_reference: 'ord_1' });
  });
  it('depois de cancelar, a nova corrida usa outra chave', async () => {
    expect(await corpo(2)).toMatchObject({ idempotency_key: 'ord_1-2', external_id: 'ord_1-2', manifest_reference: 'ord_1' });
  });
});
