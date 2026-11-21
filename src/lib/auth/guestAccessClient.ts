'use client';

/**
 * Acesso ao pedido de quem comprou sem cadastro (lib/guestAccess.ts): pedir o
 * link para o e-mail da compra e entrar com ele neste aparelho.
 */

export async function requestGuestAccess(orderId: string): Promise<void> {
  const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/guest-access`, { method: 'POST' });
  if (res.status === 429) throw new Error('Muitos pedidos de link agora. Tente de novo mais tarde.');
  if (!res.ok) throw new Error('Não deu para enviar o link. Tente de novo.');
}

export async function openGuestAccess(token: string): Promise<void> {
  const res = await fetch('/api/auth/guest-access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Não deu para abrir o pedido. Tente de novo.');
  const [{ signInWithCustomToken }, { auth }] = await Promise.all([import('firebase/auth'), import('@/lib/firebase/client')]);
  await signInWithCustomToken(auth, data.token);
}

/** Dono do link, só para saber se já é a sessão aberta (quem confere é o servidor). */
export function guestAccessUid(token: string): string | null {
  try {
    const body = atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'));
    return body.split('.')[1] || null;
  } catch {
    return null;
  }
}
