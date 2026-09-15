import { describe, it, expect } from 'vitest';
import { uberWebhookSchema } from './schema';

// Payloads no formato real documentado pela Uber (developer.uber.com/docs/
// deliveries/daas/references/api/webhooks/...). Existe pra travar o
// contrato depois de um bug onde o handler lia "event_type" em vez do
// campo real "kind" — o mismatch nunca dava erro (o webhook sempre
// respondia 200 {ok:true}), então nenhum status ou posição de entregador
// da Uber Direct real nunca chegava a atualizar o pedido, silenciosamente.
describe('uberWebhookSchema', () => {
  it('aceita um payload real de delivery_status (campo "kind", não "event_type")', () => {
    const payload = {
      kind: 'event.delivery_status',
      delivery_id: 'del_abc123',
      status: 'delivered',
      data: { id: 'del_abc123', status: 'delivered' },
    };
    const parsed = uberWebhookSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.kind).toBe('event.delivery_status');
      expect(parsed.data.delivery_id).toBe('del_abc123');
      expect(parsed.data.status).toBe('delivered');
    }
  });

  it('aceita um payload real de courier_update com location no nível raiz', () => {
    const payload = {
      kind: 'event.courier_update',
      delivery_id: 'del_abc123',
      location: { lat: -26.9155, lng: -49.0708 },
      data: { courier: { name: 'João', phone_number: '+5547999999999' } },
    };
    const parsed = uberWebhookSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.location?.lat).toBe(-26.9155);
      expect(parsed.data.location?.lng).toBe(-49.0708);
    }
  });

  it('ainda aceita payloads antigos com "event_type" (retrocompatibilidade)', () => {
    const parsed = uberWebhookSchema.safeParse({ event_type: 'event.delivery_status', resource_id: 'del_xyz' });
    expect(parsed.success).toBe(true);
  });

  it('passthrough preserva campos desconhecidos sem quebrar a validação', () => {
    const parsed = uberWebhookSchema.safeParse({ kind: 'event.delivery_status', algum_campo_novo_da_uber: 42 });
    expect(parsed.success).toBe(true);
  });
});
