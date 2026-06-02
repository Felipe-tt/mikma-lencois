'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { formatCurrency } from '@/lib/utils/format';
import type { Cart, Address } from '@/types';
import { PIXModal } from '@/components/checkout/PIXModal';

export default function CheckoutPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [cart, setCart] = useState<Cart | null>(null);
  const [cartLoading, setCartLoading] = useState(true);

  const [address, setAddress] = useState<Address>({
    cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '',
  });
  const [cepLoading, setCepLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pixData, setPixData] = useState<{ txId: string; qrCode: string; copyPaste: string } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push('/entrar'); return; }

    const unsub = onSnapshot(doc(db, 'carts', user.uid), (snap) => {
      if (!snap.exists() || !snap.data()?.items?.length) {
        router.push('/carrinho');
        return;
      }
      setCart(snap.data() as Cart);
      setCartLoading(false);
    });

    // Pre-fill address if saved
    getDoc(doc(db, 'users', user.uid)).then((snap) => {
      if (snap.data()?.address) setAddress(snap.data()!.address);
    });

    return unsub;
  }, [user, loading, router]);

  async function lookupCEP(cep: string) {
    const clean = cep.replace(/\D/g, '');
    if (clean.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setAddress(a => ({
          ...a,
          street: data.logradouro,
          neighborhood: data.bairro,
          city: data.localidade,
          state: data.uf,
          cep: clean,
        }));
      }
    } finally { setCepLoading(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !cart) return;
    setSubmitting(true);
    setError('');

    try {
      const token = await auth.currentUser!.getIdToken();
      const totalCents = cart.items.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);

      // Create order
      const orderId = `${user.uid}_${Date.now()}`;
      await setDoc(doc(db, 'orders', orderId), {
        userId: user.uid,
        items: cart.items,
        status: 'pending_payment',
        address,
        totalCents,
        payment: { method: 'pix' },
        delivery: {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Save address to user profile
      await setDoc(doc(db, 'users', user.uid), { address }, { merge: true });

      // Create PIX
      const res = await fetch('/api/payment/create-pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          orderId,
          amountCents: totalCents,
          customerName: user.displayName ?? '',
          customerEmail: user.email ?? '',
        }),
      });

      if (!res.ok) throw new Error('Erro ao gerar PIX');
      const pix = await res.json();
      setPixData(pix);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao finalizar pedido');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || cartLoading) {
    return <div className="flex min-h-64 items-center justify-center"><p className="text-sm text-gray-400">Carregando…</p></div>;
  }

  const items = cart?.items ?? [];
  const totalCents = items.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="mb-8 text-2xl font-semibold text-gray-900">Finalizar compra</h1>

      {pixData ? (
        <PIXModal pixData={pixData} totalCents={totalCents} onClose={() => router.push('/conta/pedidos')} />
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <form onSubmit={handleSubmit} className="space-y-5 lg:col-span-2">
            <h2 className="text-base font-semibold text-gray-900">Endereço de entrega</h2>

            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">CEP</label>
                <input
                  type="text" required maxLength={9}
                  value={address.cep}
                  onChange={e => { setAddress(a => ({ ...a, cep: e.target.value })); lookupCEP(e.target.value); }}
                  placeholder="00000-000"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
                {cepLoading && <p className="mt-1 text-xs text-gray-400">Buscando…</p>}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Estado</label>
                <input type="text" required value={address.state} onChange={e => setAddress(a => ({ ...a, state: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Rua</label>
              <input type="text" required value={address.street} onChange={e => setAddress(a => ({ ...a, street: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Número</label>
                <input type="text" required value={address.number} onChange={e => setAddress(a => ({ ...a, number: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Complemento</label>
                <input type="text" value={address.complement} onChange={e => setAddress(a => ({ ...a, complement: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Bairro</label>
                <input type="text" required value={address.neighborhood} onChange={e => setAddress(a => ({ ...a, neighborhood: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Cidade</label>
                <input type="text" required value={address.city} onChange={e => setAddress(a => ({ ...a, city: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
            </div>

            <button type="submit" disabled={submitting}
              className="w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {submitting ? 'Gerando PIX…' : `Gerar PIX — ${formatCurrency(totalCents)}`}
            </button>
          </form>

          {/* Order summary */}
          <div className="rounded-lg border border-gray-200 p-5">
            <h2 className="mb-4 text-base font-semibold text-gray-900">Resumo</h2>
            <ul className="space-y-2">
              {items.map(item => (
                <li key={item.sku} className="flex justify-between text-sm text-gray-600">
                  <span className="truncate pr-2">{item.productName} × {item.quantity}</span>
                  <span className="shrink-0">{formatCurrency(item.unitPrice * item.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="my-3 border-t border-gray-200" />
            <div className="flex justify-between font-semibold text-gray-900">
              <span>Total</span>
              <span>{formatCurrency(totalCents)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
