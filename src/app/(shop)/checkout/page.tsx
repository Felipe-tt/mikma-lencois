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
  const [address, setAddress] = useState<Address>({ cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' });
  const [cepLoading, setCepLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pixData, setPixData] = useState<{ txId: string; qrCode: string; copyPaste: string } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push('/entrar'); return; }
    const unsub = onSnapshot(doc(db, 'carts', user.uid), snap => {
      if (!snap.exists() || !snap.data()?.items?.length) { router.push('/carrinho'); return; }
      setCart(snap.data() as Cart); setCartLoading(false);
    });
    getDoc(doc(db, 'users', user.uid)).then(snap => {
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
      if (!data.erro) setAddress(a => ({ ...a, street: data.logradouro, neighborhood: data.bairro, city: data.localidade, state: data.uf, cep: clean }));
    } finally { setCepLoading(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !cart) return;
    setSubmitting(true); setError('');
    try {
      const token = await auth.currentUser!.getIdToken();
      const totalCents = cart.items.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);
      const orderId = `${user.uid}_${Date.now()}`;
      await setDoc(doc(db, 'orders', orderId), {
        userId: user.uid, items: cart.items, status: 'pending_payment',
        address, totalCents, payment: { method: 'pix' }, delivery: {},
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'users', user.uid), { address }, { merge: true });
      const res = await fetch('/api/payment/create-pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId, amountCents: totalCents, customerName: user.displayName ?? '', customerEmail: user.email ?? '' }),
      });
      if (!res.ok) throw new Error('Erro ao gerar PIX');
      setPixData(await res.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao finalizar pedido');
    } finally { setSubmitting(false); }
  }

  if (loading || cartLoading) {
    return <div className="min-h-[320px] flex items-center justify-center"><div className="spinner" /></div>;
  }

  const items = cart?.items ?? [];
  const total = items.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);

  return (
    <div className="bg-paper">
      <div className="border-b border-cream-dark bg-cream py-9">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="section-label mb-2">Compra</p>
          <h1 className="font-display font-light text-[34px] text-ink">Finalizar pedido</h1>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 pb-20">
        {pixData ? (
          <PIXModal pixData={pixData} totalCents={total} onClose={() => router.push('/conta/pedidos')} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-12 items-start">
            {/* Formulário */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-0">
              <p className="font-display text-[20px] text-ink mb-6">Endereço de entrega</p>

              {error && (
                <div className="bg-red-50 border border-red-200 px-4 py-3 mb-5 text-[13px] text-red-700">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="label-field">CEP</label>
                  <input type="text" required maxLength={9} value={address.cep} placeholder="00000-000" className="input-field"
                    onChange={e => { setAddress(a => ({ ...a, cep: e.target.value })); lookupCEP(e.target.value); }} />
                  {cepLoading && <p className="text-[11px] text-ink-light mt-1">Buscando…</p>}
                </div>
                <div>
                  <label className="label-field">Estado</label>
                  <input type="text" required value={address.state} onChange={e => setAddress(a => ({ ...a, state: e.target.value }))} className="input-field" />
                </div>
              </div>

              <div className="mb-4">
                <label className="label-field">Rua</label>
                <input type="text" required value={address.street} onChange={e => setAddress(a => ({ ...a, street: e.target.value }))} className="input-field" />
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="label-field">Número</label>
                  <input type="text" required value={address.number} onChange={e => setAddress(a => ({ ...a, number: e.target.value }))} className="input-field" />
                </div>
                <div>
                  <label className="label-field">Complemento</label>
                  <input type="text" value={address.complement} onChange={e => setAddress(a => ({ ...a, complement: e.target.value }))} className="input-field" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8">
                <div>
                  <label className="label-field">Bairro</label>
                  <input type="text" required value={address.neighborhood} onChange={e => setAddress(a => ({ ...a, neighborhood: e.target.value }))} className="input-field" />
                </div>
                <div>
                  <label className="label-field">Cidade</label>
                  <input type="text" required value={address.city} onChange={e => setAddress(a => ({ ...a, city: e.target.value }))} className="input-field" />
                </div>
              </div>

              <button type="submit" disabled={submitting} className="btn-primary w-full justify-center">
                {submitting ? 'Gerando PIX…' : `Gerar PIX — ${formatCurrency(total)}`}
              </button>
            </form>

            {/* Resumo */}
            <div className="summary-card">
              <p className="font-display text-[18px] text-ink mb-4">Resumo</p>
              <ul className="list-none p-0 m-0 flex flex-col gap-2.5 mb-4">
                {items.map(item => (
                  <li key={item.sku} className="flex justify-between text-[13px] text-ink-mid gap-2">
                    <span className="flex-1 truncate">{item.productName} × {item.quantity}</span>
                    <span className="shrink-0">{formatCurrency(item.unitPrice * item.quantity)}</span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-cream-dark pt-3.5 flex justify-between items-baseline">
                <span className="text-[14px] font-semibold text-ink">Total</span>
                <span className="font-display text-[20px] text-ink">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
