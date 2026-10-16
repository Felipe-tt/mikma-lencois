import { auth } from '@/lib/firebase/client';

export type NewPix = {
  qrCode: string;
  copyPaste: string;
  expiresAt?: string;
  totalCents: number;
};

/** Gera um novo PIX pra um pedido aguardando pagamento ou com PIX expirado. */
export async function requestNewPix(orderId: string): Promise<NewPix> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Entre na sua conta para gerar o PIX.');
  const res = await fetch(`/api/orders/${orderId}/regenerate-pix`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Não foi possível gerar o PIX. Tente novamente.');
  return data as NewPix;
}
