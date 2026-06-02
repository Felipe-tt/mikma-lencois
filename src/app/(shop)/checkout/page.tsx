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
    const unsub = onSnapshot(doc(db, 'carts', user.uid), (snap) => {
      if (!snap.exists() || !snap.data()?.items?.length) { router.push('/carrinho'); return; }
      setCart(snap.data() as Cart); setCartLoading(false);
    });
    getDoc(doc(db, 'users', user.uid)).then(snap => { if (snap.data()?.address) setAddress(snap.data()!.address); });
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
        userId: user.uid, items: cart.items, status: 'pending_payment', address, totalCents,
        payment: { method: 'pix' }, delivery: {}, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'users', user.uid), { address }, { merge: true });
      const res = await fetch('/api/payment/create-pix', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId, amountCents: totalCents, customerName: user.displayName ?? '', customerEmail: user.email ?? '' }),
      });
      if (!res.ok) throw new Error('Erro ao gerar PIX');
      setPixData(await res.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao finalizar pedido');
    } finally { setSubmitting(false); }
  }

  if (loading || cartLoading) return (
    <div style={{ minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ fontSize: 13, color: 'var(--ink-l)' }}>Carregando…</p>
    </div>
  );

  const items = cart?.items ?? [];
  const totalCents = items.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);

  return (
    <div style={{ background: 'var(--white)' }}>
      <div style={{ borderBottom: '1px solid var(--cream-d)', background: 'var(--cream)', padding: '36px 0' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="section-label" style={{ marginBottom: 6 }}>Compra</p>
          <h1 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 34, fontWeight: 300, color: 'var(--ink)' }}>
            Finalizar pedido
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8" style={{ paddingTop: 40, paddingBottom: 80 }}>
        {pixData ? (
          <PIXModal pixData={pixData} totalCents={totalCents} onClose={() => router.push('/conta/pedidos')} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 48, alignItems: 'start' }}>
            {/* Form */}
            <form onSubmit={handleSubmit}>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 20, color: 'var(--ink)', marginBottom: 24 }}>Endereço de entrega</p>
              {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', padding: '10px 14px', marginBottom: 20, fontSize: 13, color: 'var(--red)' }}>{error}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label className="label-field">CEP</label>
                  <input type="text" required maxLength={9} value={address.cep} placeholder="00000-000" className="input-field"
                    onChange={e => { setAddress(a => ({ ...a, cep: e.target.value })); lookupCEP(e.target.value); }} />
                  {cepLoading && <p style={{ fontSize: 11, color: 'var(--ink-l)', marginTop: 4 }}>Buscando…</p>}
                </div>
                <div>
                  <label className="label-field">Estado</label>
                  <input type="text" required value={address.state} onChange={e => setAddress(a => ({ ...a, state: e.target.value }))} className="input-field" />
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="label-field">Rua</label>
                <input type="text" required value={address.street} onChange={e => setAddress(a => ({ ...a, street: e.target.value }))} className="input-field" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label className="label-field">Número</label>
                  <input type="text" required value={address.number} onChange={e => setAddress(a => ({ ...a, number: e.target.value }))} className="input-field" />
                </div>
                <div>
                  <label className="label-field">Complemento</label>
                  <input type="text" value={address.complement} onChange={e => setAddress(a => ({ ...a, complement: e.target.value }))} className="input-field" />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
                <div>
                  <label className="label-field">Bairro</label>
                  <input type="text" required value={address.neighborhood} onChange={e => setAddress(a => ({ ...a, neighborhood: e.target.value }))} className="input-field" />
                </div>
                <div>
                  <label className="label-field">Cidade</label>
                  <input type="text" required value={address.city} onChange={e => setAddress(a => ({ ...a, city: e.target.value }))} className="input-field" />
                </div>
              </div>

              <button type="submit" disabled={submitting} className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                {submitting ? 'Gerando PIX…' : `Gerar PIX — ${formatCurrency(totalCents)}`}
              </button>
            </form>

            {/* Summary */}
            <div style={{ position: 'sticky', top: 100, border: '1px solid var(--cream-d)', padding: '24px 22px', background: 'var(--cream)' }}>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 18, color: 'var(--ink)', marginBottom: 18 }}>Resumo</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                {items.map(item => (
                  <li key={item.sku} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-m)' }}>
                    <span style={{ flex: 1, marginRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.productName} × {item.quantity}</span>
                    <span style={{ flexShrink: 0 }}>{formatCurrency(item.unitPrice * item.quantity)}</span>
                  </li>
                ))}
              </ul>
              <div style={{ borderTop: '1px solid var(--cream-d)', paddingTop: 14, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Total</span>
                <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 20, color: 'var(--ink)' }}>{formatCurrency(totalCents)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
