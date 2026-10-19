import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { verifyAbacateWebhook, ABACATEPAY_PUBLIC_HMAC_KEY } from './abacatepayWebhook';

const body = JSON.stringify({ event: 'transparent.completed', data: { transparent: { id: 'pix_char_1' } } });
const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });
const b64 = (key: string | Buffer, s: string) => createHmac('sha256', key).update(s).digest('base64');

describe('verifyAbacateWebhook', () => {
  it('Standard Webhooks: aceita assinatura v1 válida e devolve o webhook-id', () => {
    const rawKey = Buffer.from('segredo-de-teste');
    const secret = `whsec_${rawKey.toString('base64')}`;
    const sig = b64(rawKey, `msg_1.1700000000.${body}`);
    const r = verifyAbacateWebhook(body, headers({ 'webhook-id': 'msg_1', 'webhook-timestamp': '1700000000', 'webhook-signature': `v1,${sig}` }), new URLSearchParams(), secret, 1700000010);
    expect(r).toEqual({ ok: true, scheme: 'standard', deliveryId: 'msg_1' });
  });

  it('Standard Webhooks: recusa timestamp velho (replay)', () => {
    const rawKey = Buffer.from('k');
    const secret = `whsec_${rawKey.toString('base64')}`;
    const sig = b64(rawKey, `msg_1.1700000000.${body}`);
    const r = verifyAbacateWebhook(body, headers({ 'webhook-id': 'msg_1', 'webhook-timestamp': '1700000000', 'webhook-signature': `v1,${sig}` }), new URLSearchParams(), secret, 1700009999);
    expect(r.ok).toBe(false);
  });

  it('legado oficial: exige webhookSecret na URL e assinatura com a chave pública', () => {
    const sig = b64(ABACATEPAY_PUBLIC_HMAC_KEY, body);
    const ok = verifyAbacateWebhook(body, headers({ 'x-webhook-signature': sig }), new URLSearchParams('webhookSecret=abc'), 'abc');
    expect(ok).toEqual({ ok: true, scheme: 'legacy', deliveryId: null });
    const wrongSecret = verifyAbacateWebhook(body, headers({ 'x-webhook-signature': sig }), new URLSearchParams('webhookSecret=xyz'), 'abc');
    expect(wrongSecret.ok).toBe(false);
    const tampered = verifyAbacateWebhook(body + ' ', headers({ 'x-webhook-signature': sig }), new URLSearchParams('webhookSecret=abc'), 'abc');
    expect(tampered.ok).toBe(false);
  });

  it('formato antigo da loja continua aceito', () => {
    const sig = b64('abc', body);
    expect(verifyAbacateWebhook(body, headers({ 'x-abacatepay-signature': sig }), new URLSearchParams(), 'abc').ok).toBe(true);
  });

  it('sem assinatura ou sem segredo configurado: recusa', () => {
    expect(verifyAbacateWebhook(body, headers({}), new URLSearchParams(), 'abc').ok).toBe(false);
    expect(verifyAbacateWebhook(body, headers({ 'x-abacatepay-signature': b64('abc', body) }), new URLSearchParams(), undefined).ok).toBe(false);
  });
});
