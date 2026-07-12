/**
 * Testes de validação (zod) das rotas de API que recebem body.
 *
 * Não são testes de integração completos (não sobem Firestore/auth/gateway) —
 * o objetivo aqui é garantir que cada schema aceita exatamente o payload que
 * o frontend/webhook legítimo envia, e rejeita as formas malformadas mais
 * prováveis (campo faltando, tipo errado, formato inválido). Isso é a rede
 * de segurança que faltava: se alguém mexer num schema e afrouxar/quebrar
 * sem querer, esses testes acusam.
 */
import { describe, it, expect } from 'vitest';

import { addressSchema } from '@/lib/security';
import { webhookSchema } from '@/app/api/payment/webhook/route';
import { createCheckoutSchema } from '@/app/api/payment/create-checkout/route';
import { createPixSchema } from '@/app/api/payment/create-pix/route';
import { quoteSchema } from '@/app/api/shipping/quote/route';
import { mePayloadSchema } from '@/app/api/shipping/webhook/route';
import { uberWebhookSchema } from '@/app/api/shipping/uber-webhook/route';
import { dispatchSchema, cancelDeliverySchema } from '@/app/api/delivery/route';
import { updateStatusSchema } from '@/app/api/orders/[orderId]/update-status/route';
import { adminCancelSchema } from '@/app/api/orders/[orderId]/admin-cancel/route';
import { addMemberSchema, removeMemberSchema } from '@/app/api/painel/team/route';
import { shippingEstimateSchema } from '@/app/api/products/[id]/shipping-estimate/route';
import { maintenanceActionSchema } from '@/app/api/maintenance/route';
import { resendEventSchema } from '@/app/api/email/inbound/route';
import { googleVerifySchema } from '@/app/api/auth/google-verify/route';

const validAddress = {
  cep: '89010-000',
  street: 'Rua XV de Novembro',
  number: '100',
  neighborhood: 'Centro',
  city: 'Blumenau',
  state: 'SC',
};

describe('addressSchema', () => {
  it('aceita um endereço completo válido', () => {
    expect(addressSchema.safeParse(validAddress).success).toBe(true);
  });
  it('aceita CEP sem hífen', () => {
    expect(addressSchema.safeParse({ ...validAddress, cep: '89010000' }).success).toBe(true);
  });
  it('rejeita CEP com formato inválido', () => {
    expect(addressSchema.safeParse({ ...validAddress, cep: '123' }).success).toBe(false);
  });
  it('rejeita state com mais de 2 caracteres', () => {
    expect(addressSchema.safeParse({ ...validAddress, state: 'Santa Catarina' }).success).toBe(false);
  });
  it('rejeita quando falta campo obrigatório (street)', () => {
    const { street: _street, ...rest } = validAddress;
    expect(addressSchema.safeParse(rest).success).toBe(false);
  });
});

describe('payment/webhook — webhookSchema', () => {
  it('aceita envelope transparent.completed com transparent presente', () => {
    const payload = { event: 'transparent.completed', data: { transparent: { id: 'tx_1', externalId: 'ord_1' } } };
    expect(webhookSchema.safeParse(payload).success).toBe(true);
  });
  it('aceita envelope checkout.completed com checkout presente', () => {
    const payload = { event: 'checkout.completed', data: { checkout: { id: 'ch_1', externalId: 'ord_1' } } };
    expect(webhookSchema.safeParse(payload).success).toBe(true);
  });
  it('rejeita transparent.* sem data.transparent (evitaria crash no confirmOrder)', () => {
    const payload = { event: 'transparent.completed', data: {} };
    expect(webhookSchema.safeParse(payload).success).toBe(false);
  });
  it('rejeita payload sem event', () => {
    expect(webhookSchema.safeParse({ data: {} }).success).toBe(false);
  });
});

describe('payment/create-checkout — createCheckoutSchema', () => {
  it('aceita body válido de cartão', () => {
    const body = { address: validAddress, installments: 3, shipping: { carrier: 'correios_pac' } };
    expect(createCheckoutSchema.safeParse(body).success).toBe(true);
  });
  it('aplica default de installments = 1 quando omitido', () => {
    const body = { address: validAddress, shipping: { carrier: 'correios_pac' } };
    const parsed = createCheckoutSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.installments).toBe(1);
  });
  it('rejeita installments fora do range 1-12', () => {
    const body = { address: validAddress, installments: 13, shipping: { carrier: 'correios_pac' } };
    expect(createCheckoutSchema.safeParse(body).success).toBe(false);
  });
  it('rejeita quando shipping.carrier está vazio', () => {
    const body = { address: validAddress, shipping: { carrier: '' } };
    expect(createCheckoutSchema.safeParse(body).success).toBe(false);
  });
  it('rejeita quando address é omitido', () => {
    const body = { shipping: { carrier: 'correios_pac' } };
    expect(createCheckoutSchema.safeParse(body).success).toBe(false);
  });
});

describe('payment/create-pix — createPixSchema', () => {
  it('aceita body válido de PIX', () => {
    const body = { address: validAddress, shipping: { carrier: 'uber_direct' } };
    expect(createPixSchema.safeParse(body).success).toBe(true);
  });
  it('rejeita sem shipping', () => {
    expect(createPixSchema.safeParse({ address: validAddress }).success).toBe(false);
  });
});

describe('shipping/quote — quoteSchema', () => {
  it('aceita CEP válido com e sem hífen', () => {
    expect(quoteSchema.safeParse({ destCep: '89010-000' }).success).toBe(true);
    expect(quoteSchema.safeParse({ destCep: '89010000' }).success).toBe(true);
  });
  it('rejeita CEP incompleto', () => {
    expect(quoteSchema.safeParse({ destCep: '890' }).success).toBe(false);
  });
});

describe('shipping/webhook (Melhor Envio) — mePayloadSchema', () => {
  it('aceita evento válido com id numérico ou string', () => {
    expect(mePayloadSchema.safeParse({ event: 'order.posted', data: { id: 123 } }).success).toBe(true);
    expect(mePayloadSchema.safeParse({ event: 'order.posted', data: { id: 'abc' } }).success).toBe(true);
  });
  it('rejeita quando falta data.id', () => {
    expect(mePayloadSchema.safeParse({ event: 'order.posted', data: {} }).success).toBe(false);
  });
});

describe('shipping/uber-webhook — uberWebhookSchema', () => {
  it('aceita payload de delivery_status', () => {
    const body = { event_type: 'event.delivery_status', data: { id: 'del_1', status: 'pickup' } };
    expect(uberWebhookSchema.safeParse(body).success).toBe(true);
  });
  it('aceita payload sem nenhum campo conhecido (passthrough, não derruba webhook)', () => {
    expect(uberWebhookSchema.safeParse({ anything: true }).success).toBe(true);
  });
});

describe('delivery — dispatchSchema / cancelDeliverySchema', () => {
  it('dispatchSchema aceita orderId sozinho e com carrier opcional', () => {
    expect(dispatchSchema.safeParse({ orderId: 'ord_1' }).success).toBe(true);
    expect(dispatchSchema.safeParse({ orderId: 'ord_1', carrier: 'pickup' }).success).toBe(true);
  });
  it('dispatchSchema rejeita sem orderId', () => {
    expect(dispatchSchema.safeParse({}).success).toBe(false);
  });
  it('cancelDeliverySchema exige reason não-vazio', () => {
    expect(cancelDeliverySchema.safeParse({ orderId: 'ord_1', reason: '' }).success).toBe(false);
    expect(cancelDeliverySchema.safeParse({ orderId: 'ord_1', reason: 'Endereço errado' }).success).toBe(true);
  });
});

describe('orders/update-status — updateStatusSchema', () => {
  it('aceita sem trackingCode (nem todo avanço de status tem um)', () => {
    expect(updateStatusSchema.safeParse({}).success).toBe(true);
  });
  it('aceita trackingCode válido', () => {
    expect(updateStatusSchema.safeParse({ trackingCode: 'AA123456789BR' }).success).toBe(true);
  });
  it('rejeita trackingCode absurdamente longo', () => {
    expect(updateStatusSchema.safeParse({ trackingCode: 'x'.repeat(200) }).success).toBe(false);
  });
});

describe('orders/admin-cancel — adminCancelSchema', () => {
  it('aceita sem reason (usa fallback no handler)', () => {
    expect(adminCancelSchema.safeParse({}).success).toBe(true);
  });
  it('rejeita reason excessivamente longo', () => {
    expect(adminCancelSchema.safeParse({ reason: 'x'.repeat(1000) }).success).toBe(false);
  });
});

describe('painel/team — addMemberSchema / removeMemberSchema', () => {
  it('aceita e-mail e role válidos', () => {
    expect(addMemberSchema.safeParse({ email: 'seller@mikma.com.br', role: 'seller' }).success).toBe(true);
  });
  it('rejeita e-mail malformado', () => {
    expect(addMemberSchema.safeParse({ email: 'nao-e-email', role: 'seller' }).success).toBe(false);
  });
  it('rejeita role fora da allowlist (evita escalonamento pra role arbitrária)', () => {
    expect(addMemberSchema.safeParse({ email: 'x@x.com', role: 'buyer' }).success).toBe(false);
    expect(addMemberSchema.safeParse({ email: 'x@x.com', role: 'superadmin' }).success).toBe(false);
  });
  it('removeMemberSchema exige uid não-vazio', () => {
    expect(removeMemberSchema.safeParse({ uid: '' }).success).toBe(false);
    expect(removeMemberSchema.safeParse({ uid: 'uid123' }).success).toBe(true);
  });
});

describe('products/shipping-estimate — shippingEstimateSchema', () => {
  it('aplica default de qty = 1', () => {
    const parsed = shippingEstimateSchema.safeParse({ destCep: '89010-000' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.qty).toBe(1);
  });
  it('rejeita qty acima de 99', () => {
    expect(shippingEstimateSchema.safeParse({ destCep: '89010-000', qty: 100 }).success).toBe(false);
  });
});

describe('maintenance — maintenanceActionSchema (discriminated union)', () => {
  it('aceita toggle sem campos extras', () => {
    expect(maintenanceActionSchema.safeParse({ action: 'toggle' }).success).toBe(true);
  });
  it('release exige ip', () => {
    expect(maintenanceActionSchema.safeParse({ action: 'release' }).success).toBe(false);
    expect(maintenanceActionSchema.safeParse({ action: 'release', ip: '1.2.3.4' }).success).toBe(true);
  });
  it('rejeita action desconhecida', () => {
    expect(maintenanceActionSchema.safeParse({ action: 'wipe_database' }).success).toBe(false);
  });
});

describe('email/inbound — resendEventSchema', () => {
  it('aceita evento email.received válido', () => {
    const body = {
      type: 'email.received',
      created_at: '2026-07-12T00:00:00Z',
      data: { email_id: 'em_1', from: 'cliente@example.com', to: ['contato@mikma.com.br'] },
    };
    expect(resendEventSchema.safeParse(body).success).toBe(true);
  });
  it('rejeita quando falta data.from', () => {
    const body = {
      type: 'email.received',
      created_at: '2026-07-12T00:00:00Z',
      data: { email_id: 'em_1', to: ['contato@mikma.com.br'] },
    };
    expect(resendEventSchema.safeParse(body).success).toBe(false);
  });
});

describe('auth/google-verify — googleVerifySchema', () => {
  it('aceita idToken string não-vazio', () => {
    expect(googleVerifySchema.safeParse({ idToken: 'abc.def.ghi' }).success).toBe(true);
  });
  it('rejeita idToken vazio ou ausente', () => {
    expect(googleVerifySchema.safeParse({ idToken: '' }).success).toBe(false);
    expect(googleVerifySchema.safeParse({}).success).toBe(false);
  });
  it('rejeita idToken absurdamente grande (> 8192)', () => {
    expect(googleVerifySchema.safeParse({ idToken: 'x'.repeat(9000) }).success).toBe(false);
  });
});
