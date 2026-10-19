import { describe, it, expect } from 'vitest';
import { createCheckoutSchema } from './schema';
import { cardFieldsErrorMessage } from '@/components/checkout/CardFields';

const base = {
  address: { cep: '01310100', street: 'Av. Paulista', number: '1000', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' },
  installments: 2,
  shipping: { carrier: 'correios_pac' },
};

describe('createCheckoutSchema: cartão no site', () => {
  it('sem token segue o fluxo da página de pagamento', () => {
    expect(createCheckoutSchema.safeParse(base).success).toBe(true);
  });

  it('token exige o total esperado e os dados do pagador', () => {
    expect(createCheckoutSchema.safeParse({ ...base, cardToken: 'ctok_abc123' }).success).toBe(false);
    const ok = createCheckoutSchema.safeParse({
      ...base,
      cardToken: 'ctok_abc123',
      expectedTotalCents: 15990,
      customer: { name: 'Maria Silva', taxId: '529.982.247-25', cellphone: '(11) 99999-9999' },
    });
    expect(ok.success).toBe(true);
  });

  it('recusa token em outro formato', () => {
    const r = createCheckoutSchema.safeParse({
      ...base,
      cardToken: 'tok_abc123',
      expectedTotalCents: 15990,
      customer: { name: 'Maria Silva', taxId: '52998224725', cellphone: '11999999999' },
    });
    expect(r.success).toBe(false);
  });
});

describe('cardFieldsErrorMessage', () => {
  it('traduz os códigos do abacatepay.js', () => {
    expect(cardFieldsErrorMessage({ code: 'THREE_DS_FAILED' })).toMatch(/banco não confirmou/);
    expect(cardFieldsErrorMessage({ code: 'CARD_INVALID' })).toMatch(/Confira os dados/);
    expect(cardFieldsErrorMessage({ code: 'API', message: 'payer.taxId must be a valid CPF or CNPJ' })).toMatch(/CPF inválido/);
    expect(cardFieldsErrorMessage({ code: 'API', message: 'Too many requests. Try again shortly.' })).toMatch(/Aguarde um minuto/);
    expect(cardFieldsErrorMessage(new Error('x'))).toMatch(/Tente de novo/);
  });
});
