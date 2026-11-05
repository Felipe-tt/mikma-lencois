/**
 * Link do WhatsApp da loja: o link colado nas Configurações ou o número
 * (com 55 na frente). Com texto, a conversa já abre com a mensagem.
 */
export function storeWhatsapp(s: { whatsappUrl?: string; storePhone?: string }): string | null {
  const url = s.whatsappUrl?.trim();
  if (url && /^https:\/\/(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\//.test(url)) return url;
  const digits = (s.storePhone ?? '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  return digits.length >= 10 ? `https://wa.me/55${digits}` : null;
}

export function whatsappWithText(base: string, text: string): string {
  const u = new URL(base);
  u.searchParams.set('text', text);
  return u.toString();
}
