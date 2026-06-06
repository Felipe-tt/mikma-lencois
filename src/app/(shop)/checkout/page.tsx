'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { formatCurrency } from '@/lib/utils/format';
import type { Cart, Address } from '@/types';
import { PIXModal } from '@/components/checkout/PIXModal';
import { CheckoutSkeleton } from '@/components/ui/Skeleton';
import { maskCep, maskCpf, maskPhone, onlyDigits, isValidCpf, isValidPhone, isValidCep, BR_STATES } from '@/lib/masks';

interface CustomerData { name: string; cpf: string; phone: string }

export default function CheckoutPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [cart, setCart]       = useState<Cart | null>(null);
  const [cartLoading, setCL]  = useState(true);
  const [addr, setAddr]       = useState<Address>({ cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' });
  const [customer, setCustomer] = useState<CustomerData>({ name: '', cpf: '', phone: '' });
  const [cepLoading, setCepL] = useState(false);
  const [submitting, setSub]  = useState(false);
  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [apiError, setApiErr] = useState('');
  const [pixData, setPixData] = useState<{ txId: string; qrCode: string; copyPaste: string; orderId: string } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push('/entrar'); return; }

    const unsub = onSnapshot(doc(db, 'carts', user.uid), snap => {
      if (!snap.exists() || !snap.data()?.items?.length) { router.push('/carrinho'); return; }
      setCart(snap.data() as Cart);
      setCL(false);
    });

    getDoc(doc(db, 'users', user.uid)).then(s => {
      const d = s.data();
      if (d?.address) setAddr(d.address);
      setCustomer({
        name:  d?.name  ?? user.displayName ?? '',
        cpf:   d?.cpf   ?? '',
        phone: d?.phone ?? '',
      });
    });

    return unsub;
  }, [user, loading, router]);

  async function lookupCep(raw: string) {
    const c = onlyDigits(raw);
    if (c.length !== 8) return;
    setCepL(true);
    try {
      const d = await (await fetch(`https://viacep.com.br/ws/${c}/json/`)).json();
      if (!d.erro) setAddr(a => ({ ...a, street: d.logradouro, neighborhood: d.bairro, city: d.localidade, state: d.uf }));
    } finally { setCepL(false); }
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!customer.name.trim())         e.name  = 'Nome é obrigatório';
    if (!isValidCpf(customer.cpf))     e.cpf   = 'CPF inválido';
    if (!isValidPhone(customer.phone)) e.phone = 'Telefone inválido';
    if (!isValidCep(addr.cep))         e.cep   = 'CEP inválido';
    if (!addr.street.trim())           e.street = 'Rua é obrigatória';
    if (!addr.number.trim())           e.number = 'Número é obrigatório';
    if (!addr.neighborhood.trim())     e.neighborhood = 'Bairro é obrigatório';
    if (!addr.city.trim())             e.city  = 'Cidade é obrigatória';
    if (!addr.state)                   e.state = 'Estado é obrigatório';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate() || !user || !cart) return;
    setSub(true); setApiErr('');
    try {
      const token = await auth.currentUser!.getIdToken();
      // Salva dados do usuário para uso no PIX
      await setDoc(doc(db, 'users', user.uid), {
        address: addr,
        name:    customer.name,
        cpf:     onlyDigits(customer.cpf),
        phone:   onlyDigits(customer.phone),
      }, { merge: true });

      const res = await fetch('/api/payment/create-pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ address: addr }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Erro ao gerar PIX');
      setPixData(await res.json());
    } catch (err: unknown) {
      setApiErr(err instanceof Error ? err.message : 'Erro ao finalizar pedido');
    } finally { setSub(false); }
  }

  const items = cart?.items ?? [];
  const total = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  function field(key: string) {
    return errors[key] ? 'input border-red-400 focus:border-red-400 focus:ring-red-100' : 'input';
  }

  return (
    <div>
      {/* Steps */}
      <div className="border-b border-mist bg-paper">
        <div className="container-shop py-3.5">
          <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm overflow-x-auto">
            <StepDone label="Carrinho" />
            <span className="text-faint shrink-0">—</span>
            <StepActive label="Dados & Endereço" num={2} />
            <span className="text-faint shrink-0">—</span>
            <StepPending label="Pagamento PIX" num={3} />
          </div>
        </div>
      </div>

      <div className="page-header">
        <div className="container-shop">
          <span className="eyebrow mb-3 block">Compra</span>
          <h1 className="font-display font-normal text-ink text-4xl sm:text-5xl">Finalizar pedido</h1>
        </div>
      </div>

      {loading || cartLoading ? (
        <CheckoutSkeleton />
      ) : pixData ? (
        <div className="container-shop py-10 pb-20">
          <PIXModal qrCode={pixData.qrCode} copyPaste={pixData.copyPaste} orderId={pixData.orderId} totalCents={total} onClose={() => router.push('/conta/pedidos')} />
        </div>
      ) : (
        <div className="container-shop py-8 sm:py-10 pb-20">
          <div className="flex flex-col lg:grid lg:grid-cols-[1fr_340px] gap-8 lg:gap-12 items-start">
            <form onSubmit={submit} className="flex flex-col gap-8 w-full">

              {apiError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 flex items-center gap-2">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {apiError}
                </div>
              )}

              {/* ── Seção 1: Dados pessoais ── */}
              <section className="flex flex-col gap-5">
                <div className="flex items-center gap-3 pb-3 border-b border-mist">
                  <span className="w-6 h-6 rounded-full bg-ink text-paper flex items-center justify-center text-xs font-bold shrink-0">1</span>
                  <h2 className="font-display font-normal text-ink text-xl">Seus dados</h2>
                </div>

                <div>
                  <label className="label">Nome completo</label>
                  <input
                    type="text" value={customer.name} required
                    onChange={e => setCustomer(c => ({ ...c, name: e.target.value }))}
                    className={field('name')} placeholder="Como está no CPF"
                  />
                  {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">CPF</label>
                    <input
                      type="text" inputMode="numeric" value={customer.cpf} required
                      onChange={e => setCustomer(c => ({ ...c, cpf: maskCpf(e.target.value) }))}
                      className={field('cpf')} placeholder="000.000.000-00" maxLength={14}
                    />
                    {errors.cpf && <p className="text-xs text-red-500 mt-1">{errors.cpf}</p>}
                  </div>
                  <div>
                    <label className="label">Celular / WhatsApp</label>
                    <input
                      type="text" inputMode="tel" value={customer.phone} required
                      onChange={e => setCustomer(c => ({ ...c, phone: maskPhone(e.target.value) }))}
                      className={field('phone')} placeholder="(48) 99999-9999" maxLength={15}
                    />
                    {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
                  </div>
                </div>
              </section>

              {/* ── Seção 2: Endereço ── */}
              <section className="flex flex-col gap-5">
                <div className="flex items-center gap-3 pb-3 border-b border-mist">
                  <span className="w-6 h-6 rounded-full bg-ink text-paper flex items-center justify-center text-xs font-bold shrink-0">2</span>
                  <h2 className="font-display font-normal text-ink text-xl">Endereço de entrega</h2>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">CEP</label>
                    <div className="relative">
                      <input
                        type="text" inputMode="numeric" required
                        value={addr.cep}
                        onChange={e => {
                          const masked = maskCep(e.target.value);
                          setAddr(a => ({ ...a, cep: masked }));
                          lookupCep(masked);
                        }}
                        className={field('cep')} placeholder="00000-000" maxLength={9}
                      />
                      {cepLoading && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2">
                          <span className="spinner-dark" />
                        </span>
                      )}
                    </div>
                    {errors.cep && <p className="text-xs text-red-500 mt-1">{errors.cep}</p>}
                  </div>

                  <div>
                    <label className="label">Estado (UF)</label>
                    <div className="relative">
                      <select
                        value={addr.state} required
                        onChange={e => setAddr(a => ({ ...a, state: e.target.value }))}
                        className={`select ${errors.state ? 'border-red-400' : ''}`}
                      >
                        <option value="">Selecione</option>
                        {BR_STATES.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                      </select>
                      <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                    </div>
                    {errors.state && <p className="text-xs text-red-500 mt-1">{errors.state}</p>}
                  </div>
                </div>

                <div>
                  <label className="label">Rua / Logradouro</label>
                  <input type="text" required value={addr.street} onChange={e => setAddr(a => ({ ...a, street: e.target.value }))} className={field('street')} placeholder="Nome da rua" />
                  {errors.street && <p className="text-xs text-red-500 mt-1">{errors.street}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Número</label>
                    <input type="text" required value={addr.number} onChange={e => setAddr(a => ({ ...a, number: e.target.value }))} className={field('number')} placeholder="Ex: 123 ou S/N" />
                    {errors.number && <p className="text-xs text-red-500 mt-1">{errors.number}</p>}
                  </div>
                  <div>
                    <label className="label">Complemento <span className="text-faint normal-case font-normal tracking-normal">(opcional)</span></label>
                    <input type="text" value={addr.complement ?? ''} onChange={e => setAddr(a => ({ ...a, complement: e.target.value }))} className="input" placeholder="Apto, bloco, casa…" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Bairro</label>
                    <input type="text" required value={addr.neighborhood} onChange={e => setAddr(a => ({ ...a, neighborhood: e.target.value }))} className={field('neighborhood')} />
                    {errors.neighborhood && <p className="text-xs text-red-500 mt-1">{errors.neighborhood}</p>}
                  </div>
                  <div>
                    <label className="label">Cidade</label>
                    <input type="text" required value={addr.city} onChange={e => setAddr(a => ({ ...a, city: e.target.value }))} className={field('city')} />
                    {errors.city && <p className="text-xs text-red-500 mt-1">{errors.city}</p>}
                  </div>
                </div>
              </section>

              <button type="submit" disabled={submitting} className="btn-primary-lg w-full">
                {submitting
                  ? <><span className="spinner" /> Gerando PIX…</>
                  : `Gerar PIX — ${formatCurrency(total)}`
                }
              </button>
              <p className="text-xs text-faint text-center -mt-3">🔒 Dados criptografados · Pagamento 100% seguro via PIX</p>
            </form>

            {/* ── Resumo ── */}
            <div className="w-full bg-warm border border-mist p-5 sm:p-7 flex flex-col gap-4 lg:sticky lg:top-28">
              <h2 className="font-display font-normal text-ink text-xl">Resumo do pedido</h2>
              <ul className="flex flex-col gap-2.5">
                {items.map(item => (
                  <li key={item.sku} className="flex justify-between gap-3 text-sm">
                    <span className="text-mid truncate">{item.productName} <span className="text-faint">×{item.quantity}</span></span>
                    <span className="shrink-0 font-medium text-ink">{formatCurrency(item.unitPrice * item.quantity)}</span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-mist pt-3 text-xs text-faint flex justify-between">
                <span>Frete</span><span>calculado após o PIX</span>
              </div>
              <div className="flex justify-between items-baseline border-t border-mist pt-3">
                <span className="text-sm font-semibold text-ink">Total</span>
                <span className="font-display text-2xl text-ink">{formatCurrency(total)}</span>
              </div>
              <div className="border-t border-mist pt-4 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs text-mid">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  Pagamento via PIX — aprovação imediata
                </div>
                <div className="flex items-center gap-2 text-xs text-mid">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                  SSL 256-bit · dados protegidos
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepDone({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-faint shrink-0">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}
function StepActive({ label, num }: { label: string; num: number }) {
  return (
    <span className="flex items-center gap-1.5 text-ink font-semibold shrink-0">
      <span className="w-5 h-5 rounded-full bg-ink text-paper flex items-center justify-center text-xs font-bold shrink-0">{num}</span>
      {label}
    </span>
  );
}
function StepPending({ label, num }: { label: string; num: number }) {
  return (
    <span className="flex items-center gap-1.5 text-faint shrink-0">
      <span className="w-5 h-5 rounded-full border border-mist flex items-center justify-center text-xs shrink-0">{num}</span>
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}
