import { describe, expect, it } from 'vitest';
import {
  addBusinessDays, buildCancelled, buildConfirmed, buildDelivered, buildPaymentReminder, buildPixExpired, buildPixPending, buildPreparing, buildShipped, buildWithdrawalReceived,
} from './orderStatusEmails';
import type { Order } from '@/types';

const items = [{ productName: 'Lençol <Casal>', quantity: 2, unitPrice: 18990, variant: { size: 'casal', color: '#fff', colorName: 'Branco', fabric: 'Percal 200 fios' } }];
const base = { id: 'abcdefgh12345678', items, totalCents: 37980 };

describe('assunto no padrão "Pedido #X ... | Mikma Lençóis"', () => {
  it('confirmado', () => {
    expect(buildConfirmed({ ...base, payment: { method: 'pix' } }, 'Ana').subject).toBe('Pedido #12345678 confirmado | Mikma Lençóis');
  });
  it('cancelado e PIX expirado', () => {
    expect(buildCancelled(base, 'Ana', { refund: false }).subject).toBe('Pedido #12345678 cancelado | Mikma Lençóis');
    expect(buildPixExpired(base, 'Ana').subject).toBe('Pedido #12345678 com PIX expirado | Mikma Lençóis');
  });
});

describe('conteúdo', () => {
  it('escapa nome de produto e cliente', () => {
    const { html } = buildConfirmed({ ...base, payment: { method: 'card' } }, '<b>Ana</b>');
    expect(html).toContain('Lençol &lt;Casal&gt;');
    expect(html).not.toContain('<b>Ana</b>');
  });
  it('confirmado: como chega, a previsão e o direito de desistir', () => {
    const { text, html } = buildConfirmed(
      { ...base, payment: { method: 'pix' }, delivery: { label: 'Correios PAC', estimatedDays: 6, carrier: 'correios_pac' } },
      'Ana',
      new Date('2026-11-03T15:00:00Z'),
    );
    // terça 03/11 + 6 dias úteis: quarta 11/11
    expect(text).toContain('Entrega: Correios PAC, previsão até quarta-feira, 11/11.');
    expect(text).toContain('desistir da compra em até 7 dias');
    expect(html).toContain('/trocas-e-devolucoes');
  });
  it('confirmado: retirada na loja não tem previsão de entrega', () => {
    const { text } = buildConfirmed({ ...base, payment: { method: 'pix' }, delivery: { label: 'Retirar na loja', estimatedDays: 0, carrier: 'pickup' } }, 'Ana');
    expect(text).toContain('Entrega: Retirada na loja.');
  });
  it('cancelado: linha de reembolso só quando foi pago', () => {
    expect(buildCancelled(base, 'Ana', { refund: true }).text).toContain('será devolvido');
    expect(buildCancelled(base, 'Ana', { refund: false }).text).toContain('Nenhuma cobrança foi feita');
  });
  it('PIX pendente traz o código copia e cola', () => {
    const p = buildPixPending(base, 'Ana', { copyPaste: '000201PIXCODE', expiresAt: '2026-10-17T12:00:00Z' });
    expect(p.html).toContain('000201PIXCODE');
    expect(p.text).toContain('000201PIXCODE');
  });
  it('PIX pendente embute o QR Code quando vem a imagem', () => {
    const png = 'data:image/png;base64,' + Buffer.from('fake-png').toString('base64');
    const p = buildPixPending(base, 'Ana', { copyPaste: '000201PIXCODE', qrCode: png });
    expect(p.html).toContain('src="cid:pix-qrcode"');
    expect(p.attachments).toHaveLength(1);
    expect(p.attachments![0]).toMatchObject({ contentId: 'pix-qrcode', contentType: 'image/png', filename: 'qrcode-pix.png' });
    expect(p.attachments![0].content.toString()).toBe('fake-png');
  });
  it('PIX pendente sem imagem válida fica só com o copia e cola', () => {
    const p = buildPixPending(base, 'Ana', { copyPaste: '000201PIXCODE', qrCode: 'https://x/qr.png' });
    expect(p.html).not.toContain('cid:');
    expect(p.attachments).toBeUndefined();
  });
  it('despachado mostra previsão quando há prazo e usa "Rastrear envio"', () => {
    const order = {
      ...base, userId: 'u', status: 'shipped',
      payment: { method: 'pix', txId: 't' },
      delivery: { carrier: 'correios_pac', trackingCode: 'AA123456789BR', estimatedDays: 3 },
    } as unknown as Order;
    const { html } = buildShipped(order, 'Ana', new Date('2026-10-16T12:00:00'));
    expect(html).toContain('Previsão de entrega');
    expect(html).toContain('Rastrear envio');
    expect(html).not.toContain('Rastrear na');
  });
  it.each([['correios_pac', 'Correios PAC'], ['correios_sedex', 'Correios SEDEX']])('despacho por %s leva o código e o link de rastreio dos Correios', (carrier, label) => {
    const order = {
      ...base, userId: 'u', status: 'shipped',
      payment: { method: 'pix', txId: 't' },
      delivery: { carrier, trackingCode: 'AB123456789BR', estimatedDays: 5 },
    } as unknown as Order;
    const { subject, html, text } = buildShipped(order, 'Ana', new Date('2026-10-16T12:00:00'));
    expect(subject).toContain('despachado');
    expect(html).toContain(`Código de rastreio · ${label}`);
    expect(html).toContain('AB123456789BR');
    expect(html).toContain('https://rastreamento.correios.com.br/app/index.php?objetos=AB123456789BR');
    expect(text).toContain('Rastreio: AB123456789BR');
  });
});

describe('addBusinessDays', () => {
  it('pula o fim de semana', () => {
    // sexta + 1 dia útil = segunda
    expect(addBusinessDays(new Date('2026-10-16T12:00:00'), 1).getDay()).toBe(1);
  });
});

describe('em separação', () => {
  const pedido = { ...base, status: 'preparing', payment: { method: 'pix' }, delivery: { carrier: 'correios_pac' } } as unknown as Parameters<typeof buildPreparing>[0];
  it('entrega: avisa que vem outro e-mail no despacho', () => {
    expect(buildPreparing(pedido, 'Ana').text).toContain('assim que ele for despachado');
  });
  it('retirada: diz onde buscar, sem prometer despacho', () => {
    const e = buildPreparing(pedido, 'Ana', { address: 'Rua da Fábrica, 100, Itoupava Central, Blumenau/SC' });
    expect(e.text).toContain('pronto para retirada na loja, em Rua da Fábrica, 100');
    expect(e.text).toContain('#12345678');
    expect(e.text).not.toContain('despachado');
    expect(e.html).not.toContain('despachado');
  });
});

describe('desistência recebida (Decreto 7.962, art. 5º, § 4º)', () => {
  const at = new Date('2026-11-20T14:30:00Z');
  it('confirma na hora, com o valor e o horário de Brasília', () => {
    const e = buildWithdrawalReceived(base, 'Ana', { at });
    expect(e.subject).toBe('Pedido #12345678 desistência recebida | Mikma Lençóis');
    expect(e.text).toContain('20/11, 11:30');
    expect(e.text).toContain('devolver todo o valor pago, R$');
    expect(e.text).not.toContain('recusar');
  });
  it('pedido já saiu: explica que dá para recusar', () => {
    expect(buildWithdrawalReceived(base, 'Ana', { at, emTransito: true }).text).toContain('recusar o recebimento');
  });
  it('escapa o nome no HTML', () => {
    expect(buildWithdrawalReceived(base, '<b>Ana</b>', { at }).html).not.toContain('<b>Ana</b>');
  });
});

describe('convidado: os e-mails de pagamento já abrem o pedido', () => {
  const link = 'https://mikma.com.br/pedidos/abcdefgh12345678?acesso=abc.def';
  it('falta o PIX, PIX expirado e lembrete usam o link de acesso', () => {
    const pending = buildPixPending(base, 'Ana', { copyPaste: '000201...' }, link);
    const expired = buildPixExpired(base, 'Ana', link);
    const reminder = buildPaymentReminder(base, 'Ana', link);
    for (const e of [pending, expired, reminder]) {
      expect(e.text).toContain(link);
      expect(e.html).toContain('acesso=abc.def');
    }
  });
  it('sem link (conta), continua o endereço normal do pedido', () => {
    expect(buildPixExpired(base, 'Ana').text).toContain('/pedidos/abcdefgh12345678');
    expect(buildPixExpired(base, 'Ana').text).not.toContain('acesso=');
  });
});

describe('convidado: os e-mails do andamento também abrem o pedido', () => {
  const link = 'https://mikma.com.br/pedidos/abcdefgh12345678?acesso=xyz.789';
  const doc = { ...base, payment: { method: 'pix' }, status: 'paid', userId: 'u1', delivery: { carrier: 'correios_pac', trackingCode: 'AA123456789BR', estimatedDays: 5 } } as unknown as Parameters<typeof buildShipped>[0];
  it('confirmado, em separação, despachado e entregue usam o link de acesso', () => {
    const emails = [
      buildConfirmed({ ...base, payment: { method: 'pix' } }, 'Ana', new Date(), link),
      buildPreparing(doc, 'Ana', undefined, link),
      buildShipped(doc, 'Ana', new Date(), link),
      buildDelivered(doc, 'Ana', link),
    ];
    for (const e of emails) expect(e.html).toContain('acesso=xyz.789');
  });
  it('sem link, o endereço normal do pedido', () => {
    expect(buildShipped(doc, 'Ana').html).not.toContain('acesso=');
  });
});
