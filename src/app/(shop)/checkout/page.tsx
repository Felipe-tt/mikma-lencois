'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot, getDoc, setDoc } from 'firebase/firestore';
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
  const [addr, setAddr] = useState<Address>({ cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' });
  const [cepLoading, setCepLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pixData, setPixData] = useState<{ txId: string; qrCode: string; copyPaste: string; orderId: string } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push('/entrar'); return; }
    const unsub = onSnapshot(doc(db, 'carts', user.uid), snap => {
      if (!snap.exists() || !snap.data()?.items?.length) { router.push('/carrinho'); return; }
      setCart(snap.data() as Cart); setCartLoading(false);
    });
    getDoc(doc(db, 'users', user.uid)).then(s => { if (s.data()?.address) setAddr(s.data()!.address); });
    return unsub;
  }, [user, loading, router]);

  async function lookupCep(cep: string) {
    const c = cep.replace(/\D/g, '');
    if (c.length !== 8) return;
    setCepLoading(true);
    try {
      const d = await (await fetch(`https://viacep.com.br/ws/${c}/json/`)).json();
      if (!d.erro) setAddr(a => ({ ...a, street: d.logradouro, neighborhood: d.bairro, city: d.localidade, state: d.uf, cep: c }));
    } finally { setCepLoading(false); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !cart) return;
    setSubmitting(true); setError('');
    try {
      const token = await auth.currentUser!.getIdToken();
      const totalCents = cart.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
      await setDoc(doc(db, 'users', user.uid), { address: addr }, { merge: true });
      const res = await fetch('/api/payment/create-pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ items: cart.items, address: addr, amountCents: totalCents, customerName: user.displayName ?? '', customerEmail: user.email ?? '' }),
      });
      if (!res.ok) throw new Error('Erro ao gerar PIX');
      setPixData(await res.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao finalizar pedido');
    } finally { setSubmitting(false); }
  }

  if (loading || cartLoading) {
    return <div className="min-h-[400px] flex items-center justify-center"><div className="spinner" /></div>;
  }

  const items = cart?.items ?? [];
  const total = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  return (
    <div>
      {/* Steps */}
      <div className="border-b border-stone-200 bg-white">
        <div className="container-shop py-4">
          <div className="flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1.5 text-stone-400"><CheckCircle /> Carrinho</span>
            <span className="text-stone-300">—</span>
            <span className="flex items-center gap-1.5 text-stone-900 font-semibold">
              <span className="w-5 h-5 rounded-full bg-stone-900 text-white flex items-center justify-center text-xs font-bold">2</span>
              Endereço
            </span>
            <span className="text-stone-300">—</span>
            <span className="flex items-center gap-1.5 text-stone-400">
              <span className="w-5 h-5 rounded-full border border-stone-300 flex items-center justify-center text-xs text-stone-400">3</span>
              Pagamento
            </span>
          </div>
        </div>
      </div>

      <div className="page-hero">
        <div className="container-shop">
          <span className="eyebrow mb-2 block">Compra</span>
          <h1 className="font-display text-4xl font-light text-stone-900">Finalizar pedido</h1>
        </div>
      </div>

      <div className="container-shop py-10 pb-20">
        {pixData ? (
          <PIXModal qrCode={pixData.qrCode} copyPaste={pixData.copyPaste} orderId={pixData.orderId} totalCents={total} onClose={() => router.push("/conta/pedidos")} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-12 items-start">
            <form onSubmit={submit} className="flex flex-col gap-6">
              <h2 className="font-display text-2xl font-light text-stone-900">Endereço de entrega</h2>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">CEP</label>
                  <input type="text" required maxLength={9} value={addr.cep} placeholder="00000-000" className="input"
                    onChange={e => { setAddr(a => ({ ...a, cep: e.target.value })); lookupCep(e.target.value); }} />
                  {cepLoading && <p className="text-xs text-stone-400 mt-1">Buscando…</p>}
                </div>
                <div>
                  <label className="label">Estado</label>
                  <input type="text" required value={addr.state} onChange={e => setAddr(a => ({ ...a, state: e.target.value }))} className="input" maxLength={2} />
                </div>
              </div>

              <div>
                <label className="label">Rua / Logradouro</label>
                <input type="text" required value={addr.street} onChange={e => setAddr(a => ({ ...a, street: e.target.value }))} className="input" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Número</label>
                  <input type="text" required value={addr.number} onChange={e => setAddr(a => ({ ...a, number: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="label">Complemento</label>
                  <input type="text" value={addr.complement} onChange={e => setAddr(a => ({ ...a, complement: e.target.value }))} className="input" placeholder="Apto, bloco…" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Bairro</label>
                  <input type="text" required value={addr.neighborhood} onChange={e => setAddr(a => ({ ...a, neighborhood: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="label">Cidade</label>
                  <input type="text" required value={addr.city} onChange={e => setAddr(a => ({ ...a, city: e.target.value }))} className="input" />
                </div>
              </div>

              <button type="submit" disabled={submitting} className="btn-primary-lg w-full mt-2">
                {submitting ? <span className="spinner w-4 h-4" /> : `Gerar PIX — ${formatCurrency(total)}`}
              </button>

              <p className="text-xs text-stone-400 text-center">🔒 Pagamento seguro via PIX — confirmação automática</p>
            </form>

            {/* Resumo */}
            <div className="order-summary flex flex-col gap-4">
              <h2 className="font-display text-xl font-light text-stone-900">Resumo do pedido</h2>
              <ul className="flex flex-col gap-2">
                {items.map(item => (
                  <li key={item.sku} className="flex justify-between gap-3 text-sm text-stone-600">
                    <span className="truncate">{item.productName} × {item.quantity}</span>
                    <span className="shrink-0 font-medium">{formatCurrency(item.unitPrice * item.quantity)}</span>
                  </li>
                ))}
              </ul>
              <div className="divider" />
              <div className="flex justify-between text-sm text-stone-500">
                <span>Frete</span><span>calculado após o PIX</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-sm font-semibold text-stone-900">Total</span>
                <span className="font-display text-2xl text-stone-900">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CheckCircle() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
}
