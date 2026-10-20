import { describe, expect, it } from 'vitest';
import {
  addBusinessDays, buildCancelled, buildConfirmed, buildPixExpired, buildPixPending, buildShipped,
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
});

describe('addBusinessDays', () => {
  it('pula o fim de semana', () => {
    // sexta + 1 dia útil = segunda
    expect(addBusinessDays(new Date('2026-10-16T12:00:00'), 1).getDay()).toBe(1);
  });
});
