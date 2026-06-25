'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { formatCurrency } from '@/lib/utils/format';
import type { Cart, Address } from '@/types';
import { PIXModal } from '@/components/checkout/PIXModal';
import { CheckoutSkeleton } from '@/components/ui/Skeleton';
import { maskCep, maskCpf, maskPhone, onlyDigits, isValidCpf, isValidPhone, isValidCep, BR_STATES } from '@/lib/masks';
import type { ShippingOption } from '@/app/api/shipping/quote/route';
import Image from 'next/image';

interface CustomerData { name: string; cpf: string; phone: string; email: string }

// ── Carrier delivery date estimate ───────────────────────────────────────────
function estimatedDate(days: number): string {
  const d = new Date();
  if (days === 0) return 'Hoje';
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++; // skip weekends
  }
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

// ── Carrier icon ─────────────────────────────────────────────────────────────
function CarrierIcon({ carrier }: { carrier: string }) {
  const cls = 'w-4 h-4 shrink-0';
  if (carrier === 'pickup') return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={cls}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
  );
  if (carrier.startsWith('jadlog')) return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={cls}><rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
  );
  // correios_pac, correios_sedex
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={cls}><rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
  );
}

const TAG: Record<string, { label: string; cls: string }> = {
  local:     { label: 'Retirada grátis', cls: 'bg-emerald-100 text-emerald-800' },
  rapido:    { label: 'Mais rápido',     cls: 'bg-amber-100 text-amber-800' },
  economico: { label: 'Mais econômico',  cls: 'bg-sky-100 text-sky-800' },
};

// ── Field components ─────────────────────────────────────────────────────────
function Label({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-[#5A4535] mb-1.5 tracking-[0.03em]">
      {children}
      {optional && <span className="ml-1.5 text-[#B09C8C] font-normal">opcional</span>}
    </label>
  );
}
function Err({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-red-600 font-medium">
      <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
      {msg}
    </p>
  );
}
function Input({
  value, onChange, onBlur, placeholder, type = 'text', inputMode,
  maxLength, required, hasError, disabled, autoComplete,
}: {
  value: string; onChange: (v: string) => void; onBlur?: () => void;
  placeholder?: string; type?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  maxLength?: number; required?: boolean; hasError?: boolean; disabled?: boolean; autoComplete?: string;
}) {
  const [touched, setTouched] = useState(false);
  const valid = !hasError && value.length > 0;
  return (
    <div className="relative">
      <input
        type={type}
        value={value}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onBlur={() => { setTouched(true); onBlur?.(); }}
        className={`w-full border px-3.5 py-3 text-sm text-[#1E1208] placeholder:text-[#C8B8A8] focus:outline-none transition-all duration-150 ${
          hasError && touched
            ? 'border-red-400 bg-red-50/40 focus:border-red-400 focus:ring-2 focus:ring-red-100'
            : valid
              ? 'border-emerald-400 bg-white focus:border-ink/40 focus:ring-2 focus:ring-ink/5'
              : 'border-[#E0D8CE] bg-white focus:border-[#1E1208]/40 focus:ring-2 focus:ring-[#1E1208]/5'
        } disabled:bg-[#F9F6F1] disabled:text-[#B09C8C]`}
      />
      {valid && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 pointer-events-none">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      )}
    </div>
  );
}

// ── Accordion section ─────────────────────────────────────────────────────────
function Section({
  num, label, done, open, onEdit, children,
}: {
  num: number; label: string; done?: boolean; open: boolean;
  onEdit?: () => void; children: React.ReactNode;
}) {
  return (
    <div className={`border transition-colors ${open ? 'border-[#1E1208]/20' : 'border-[#E0D8CE]'}`}>
      <div
        className={`flex items-center gap-3 px-5 py-4 ${!open && done ? 'cursor-pointer hover:bg-[#F9F6F1]/60' : ''}`}
        onClick={() => !open && done && onEdit?.()}
      >
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
          done && !open ? 'bg-emerald-600 text-white' :
          open          ? 'bg-[#1E1208] text-white' :
                          'border-2 border-[#E0D8CE] text-[#B09C8C]'
        }`}>
          {done && !open
            ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            : num
          }
        </span>
        <div className="flex-1 min-w-0">
          <h2 className={`text-sm font-bold ${open ? 'text-[#1E1208]' : done ? 'text-[#5A4535]' : 'text-[#B09C8C]'}`}>
            {label}
          </h2>
        </div>
        {done && !open && (
          <button type="button" onClick={onEdit} className="text-xs font-semibold text-[#C4714A] hover:text-[#A05838] transition-colors shrink-0">
            Editar
          </button>
        )}
      </div>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CheckoutPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [cart, setCart]       = useState<Cart | null>(null);
  const [cartLoading, setCL]  = useState(true);
  const [step, setStep]       = useState<1 | 2 | 3>(1); // 1=dados, 2=endereço, 3=entrega
  const [s1done, setS1Done]   = useState(false);
  const [s2done, setS2Done]   = useState(false);

  const [addr, setAddr]       = useState<Address>({ cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' });
  const [customer, setCustomer] = useState<CustomerData>({ name: '', cpf: '', phone: '', email: '' });
  const [cepLoading, setCepL] = useState(false);
  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [apiError, setApiErr] = useState('');
  const [submitting, setSub]  = useState(false);
  const [pixData, setPixData] = useState<{ txId: string; qrCode: string; copyPaste: string; orderId: string; expiresAt?: string } | null>(null);
  const [payMethod, setPayMethod]     = useState<'pix' | 'credit'>('pix');
  const [installments, setInstall]    = useState(1);
  const [creditRedirect, setCreditRed] = useState<string | null>(null);

  const [shippingOptions, setShipOpts]  = useState<ShippingOption[]>([]);
  const [selectedShipping, setSelShip]  = useState<ShippingOption | null>(null);
  const [shippingLoading, setShipLoad]  = useState(false);
  const [shippingError, setShipErr]     = useState('');
  const [quotedCep, setQuotedCep]       = useState('');

  const cepRef = useRef<string>('');

  const quoteShipping = useCallback(async (cep: string) => {
    const clean = onlyDigits(cep);
    if (clean.length !== 8 || clean === quotedCep) return;
    setShipLoad(true); setShipErr(''); setShipOpts([]); setSelShip(null);
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch('/api/shipping/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ destCep: clean }),
      });
      if (!res.ok) { setShipErr((await res.json().catch(() => ({}))).error ?? 'Erro ao calcular frete'); return; }
      const data = await res.json();
      setShipOpts(data.options);
      setSelShip(data.options[0] ?? null);
      setQuotedCep(clean);
    } catch { setShipErr('Não foi possível calcular o frete. Tente novamente.'); }
    finally { setShipLoad(false); }
  }, [quotedCep]);

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
        name: d?.name ?? user.displayName ?? '',
        cpf: d?.cpf ? maskCpf(d.cpf) : '',
        phone: d?.phone ? maskPhone(d.phone) : '',
        email: user.email ?? '',
      });
    });
    return unsub;
  }, [user, loading, router]);

  useEffect(() => {
    if (isValidCep(addr.cep) && !quotedCep) quoteShipping(addr.cep);
  }, [addr.cep, quotedCep, quoteShipping]);

  async function lookupCep(raw: string) {
    const c = onlyDigits(raw);
    if (c.length !== 8) return;
    setCepL(true);
    try {
      const d = await (await fetch(`https://viacep.com.br/ws/${c}/json/`)).json();
      if (!d.erro) setAddr(a => ({ ...a, street: d.logradouro ?? a.street, neighborhood: d.bairro ?? a.neighborhood, city: d.localidade ?? a.city, state: d.uf ?? a.state }));
    } finally { setCepL(false); }
    quoteShipping(raw);
  }

  function validateStep1(): boolean {
    const e: Record<string, string> = {};
    if (!customer.name.trim())         e.name  = 'Nome é obrigatório';
    if (!isValidCpf(customer.cpf))     e.cpf   = 'CPF inválido';
    if (!isValidPhone(customer.phone)) e.phone = 'Telefone inválido';
    setErrors(e);
    return Object.keys(e).length === 0;
  }
  function validateStep2(): boolean {
    const e: Record<string, string> = {};
    if (!isValidCep(addr.cep))         e.cep   = 'CEP inválido';
    if (!addr.street.trim())           e.street = 'Rua é obrigatória';
    if (!addr.number.trim())           e.number = 'Número é obrigatório';
    if (!addr.neighborhood.trim())     e.neighborhood = 'Bairro é obrigatório';
    if (!addr.city.trim())             e.city  = 'Cidade é obrigatória';
    if (!addr.state)                   e.state = 'Estado é obrigatório';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function advanceToStep2() {
    if (!validateStep1()) return;
    setS1Done(true);
    setStep(2);
  }
  function advanceToStep3() {
    if (!validateStep2()) return;
    setS2Done(true);
    setStep(3);
    if (isValidCep(addr.cep)) quoteShipping(addr.cep);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedShipping || !user || !cart) return;
    setSub(true); setApiErr('');
    try {
      const token = await auth.currentUser!.getIdToken();
      await setDoc(doc(db, 'users', user.uid), {
        address: addr, name: customer.name,
        cpf: onlyDigits(customer.cpf), phone: onlyDigits(customer.phone),
      }, { merge: true });

      if (payMethod === 'pix') {
        const res = await fetch('/api/payment/create-pix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ address: addr, shipping: selectedShipping, pixDiscount }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? 'Erro ao gerar PIX');
        setPixData(await res.json());
      } else {
        const res = await fetch('/api/payment/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ address: addr, shipping: selectedShipping, installments }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? 'Erro ao gerar checkout');
        const d = await res.json();
        setCreditRed(d.checkoutUrl);
        window.location.href = d.checkoutUrl;
      }
    } catch (err: unknown) {
      setApiErr(err instanceof Error ? err.message : 'Erro ao finalizar pedido.');
    } finally { setSub(false); }
  }

  const items       = cart?.items ?? [];
  const subtotal    = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const shipCents   = selectedShipping?.priceCents ?? 0;
  const PIX_DISCOUNT_THRESHOLD = 180000; // R$ 1.800,00
  const pixDiscount  = subtotal >= PIX_DISCOUNT_THRESHOLD ? Math.round(subtotal * 0.10) : 0;
  const pixTotal     = subtotal - pixDiscount + shipCents;
  // Crédito: sem desconto, com possibilidade de juros (embutidos no backend)
  const creditTotal  = subtotal + shipCents;
  const total        = payMethod === 'pix' ? pixTotal : creditTotal;
  const totalItems   = items.reduce((s, i) => s + i.quantity, 0);
  // Parcelamento: mín R$100/parcela, máx 8x
  const maxInstall   = Math.min(8, Math.floor(creditTotal / 10000));
  const installVal   = Math.round(creditTotal / installments);

  if (loading || cartLoading) return <CheckoutSkeleton />;
  if (pixData) return (
    <PIXModal
      qrCode={pixData.qrCode}
      copyPaste={pixData.copyPaste}
      orderId={pixData.orderId}
      totalCents={total}
      expiresAt={pixData.expiresAt}
      onClose={() => router.push('/conta/pedidos')}
    />
  );

  return (
    <div className="min-h-screen bg-[#FAFAF9]">

      {/* ── Top bar ── */}
      <div className="bg-white border-b border-[#E0D8CE] sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 overflow-x-auto scrollbar-none">
            <Crumb state="done" label="Carrinho" />
            <CrumbDivider />
            <Crumb state={step >= 1 ? 'active' : 'pending'} label="Identificação" />
            <CrumbDivider />
            <Crumb state={step >= 2 ? 'active' : 'pending'} label="Endereço" />
            <CrumbDivider />
            <Crumb state={step >= 3 ? 'active' : 'pending'} label="Entrega e pagamento" />
          </div>
          <div className="shrink-0 hidden sm:flex items-center gap-1.5 text-[11px] text-[#B09C8C]">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            Compra segura
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="flex flex-col lg:grid lg:grid-cols-[1fr_380px] gap-6 lg:gap-10 items-start">

          {/* ── Formulário accordion ── */}
          <form onSubmit={submit} className="flex flex-col gap-3 w-full">

            {apiError && (
              <div className="flex items-start gap-3 border border-red-200 bg-red-50 text-red-700 px-4 py-3.5 text-sm rounded-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 mt-px text-red-500"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                {apiError}
              </div>
            )}

            {/* ── Seção 1: Identificação ── */}
            <Section num={1} label="Identificação" open={step === 1} done={s1done} onEdit={() => setStep(1)}>
              <div className="flex flex-col gap-4">
                <div>
                  <Label>Nome completo</Label>
                  <Input value={customer.name} onChange={v => setCustomer(c => ({ ...c, name: v }))}
                    placeholder="Como consta no documento" required hasError={!!errors.name}
                    autoComplete="name" />
                  <Err msg={errors.name} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>CPF</Label>
                    <Input value={customer.cpf} onChange={v => setCustomer(c => ({ ...c, cpf: maskCpf(v) }))}
                      inputMode="numeric" maxLength={14} placeholder="000.000.000-00"
                      required hasError={!!errors.cpf} autoComplete="off" />
                    <Err msg={errors.cpf} />
                  </div>
                  <div>
                    <Label>Celular / WhatsApp</Label>
                    <Input value={customer.phone} onChange={v => setCustomer(c => ({ ...c, phone: maskPhone(v) }))}
                      type="tel" maxLength={15} placeholder="(47) 99999-0000"
                      required hasError={!!errors.phone} autoComplete="tel" />
                    <Err msg={errors.phone} />
                  </div>
                </div>
                <button type="button" onClick={advanceToStep2}
                  className="w-full h-12 bg-[#1E1208] text-white text-sm font-bold tracking-[0.05em] hover:bg-[#7C5C3E] transition-colors mt-1">
                  Continuar para endereço
                </button>
              </div>
            </Section>

            {/* ── Seção 2: Endereço ── */}
            <Section num={2} label="Endereço de entrega" open={step === 2} done={s2done} onEdit={() => setStep(2)}>
              <div className="flex flex-col gap-4">
                {/* CEP */}
                <div>
                  <Label>CEP</Label>
                  <div className="relative">
                    <Input value={addr.cep} onChange={v => {
                      const masked = maskCep(v);
                      setAddr(a => ({ ...a, cep: masked }));
                      if (onlyDigits(masked).length === 8) lookupCep(masked);
                    }} inputMode="numeric" maxLength={9} placeholder="00000-000"
                      required hasError={!!errors.cep} autoComplete="postal-code" />
                    {(cepLoading || shippingLoading) && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"><span className="spinner" /></span>
                    )}
                  </div>
                  <Err msg={errors.cep} />
                </div>
                {/* Rua */}
                <div>
                  <Label>Logradouro</Label>
                  <Input value={addr.street} onChange={v => setAddr(a => ({ ...a, street: v }))}
                    placeholder="Rua, Avenida, Travessa…" required hasError={!!errors.street} autoComplete="address-line1" />
                  <Err msg={errors.street} />
                </div>
                {/* Número + Complemento */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Número</Label>
                    <Input value={addr.number} onChange={v => setAddr(a => ({ ...a, number: v }))}
                      placeholder="123 ou S/N" required hasError={!!errors.number} autoComplete="address-line2" />
                    <Err msg={errors.number} />
                  </div>
                  <div>
                    <Label optional>Complemento</Label>
                    <Input value={addr.complement ?? ''} onChange={v => setAddr(a => ({ ...a, complement: v }))}
                      placeholder="Apto, bloco…" autoComplete="address-line3" />
                  </div>
                </div>
                {/* Bairro */}
                <div>
                  <Label>Bairro</Label>
                  <Input value={addr.neighborhood} onChange={v => setAddr(a => ({ ...a, neighborhood: v }))}
                    required hasError={!!errors.neighborhood} autoComplete="address-level3" />
                  <Err msg={errors.neighborhood} />
                </div>
                {/* Cidade + UF */}
                <div className="grid grid-cols-[1fr_96px] gap-3">
                  <div>
                    <Label>Cidade</Label>
                    <Input value={addr.city} onChange={v => setAddr(a => ({ ...a, city: v }))}
                      required hasError={!!errors.city} autoComplete="address-level2" />
                    <Err msg={errors.city} />
                  </div>
                  <div>
                    <Label>UF</Label>
                    <div className="relative">
                      <select value={addr.state} required onChange={e => setAddr(a => ({ ...a, state: e.target.value }))}
                        className={`w-full border px-3 py-3 text-sm appearance-none bg-white focus:outline-none focus:ring-2 transition-all ${errors.state ? 'border-red-400 focus:ring-red-100' : 'border-[#E0D8CE] focus:border-[#1E1208]/40 focus:ring-[#1E1208]/5'}`}>
                        <option value="">--</option>
                        {BR_STATES.map(uf => <option key={uf}>{uf}</option>)}
                      </select>
                      <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#B09C8C]" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                    </div>
                    <Err msg={errors.state} />
                  </div>
                </div>
                <button type="button" onClick={advanceToStep3}
                  className="w-full h-12 bg-[#1E1208] text-white text-sm font-bold tracking-[0.05em] hover:bg-[#7C5C3E] transition-colors mt-1">
                  Continuar para entrega
                </button>
              </div>
            </Section>

            {/* ── Seção 3: Entrega + Pagamento ── */}
            <Section num={3} label="Entrega e pagamento" open={step === 3} done={false}>
              <div className="flex flex-col gap-6">

                {/* Opções de frete */}
                <div>
                  <p className="text-xs font-bold text-[#5A4535] tracking-[0.05em] uppercase mb-3">Opção de entrega</p>
                  {shippingLoading ? (
                    <div className="flex items-center gap-3 border border-[#E0D8CE] bg-white px-4 py-4 text-sm text-[#9C8878]">
                      <span className="spinner shrink-0" />
                      Calculando opções para o CEP {addr.cep}…
                    </div>
                  ) : shippingError ? (
                    <div className="border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-600 flex items-center justify-between">
                      {shippingError}
                      <button type="button" onClick={() => { setQuotedCep(''); quoteShipping(addr.cep); }}
                        className="ml-3 text-red-700 font-semibold underline text-xs shrink-0">
                        Tentar novamente
                      </button>
                    </div>
                  ) : shippingOptions.length > 0 ? (
                    <div className="flex flex-col divide-y divide-[#E0D8CE] border border-[#E0D8CE] bg-white overflow-hidden">
                      {shippingOptions.map(opt => {
                        const sel = selectedShipping?.carrier === opt.carrier;
                        return (
                          <button
                            key={opt.carrier}
                            type="button"
                            onClick={() => setSelShip(opt)}
                            className={`flex items-center gap-4 w-full px-4 py-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E1208]/30 ${sel ? 'bg-[#F2ECE5]' : 'hover:bg-[#F9F6F1]'}`}
                          >
                            {/* Radio */}
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${sel ? 'border-[#1E1208]' : 'border-[#C8B8A8]'}`}>
                              {sel && <span className="w-2.5 h-2.5 rounded-full bg-[#1E1208]" />}
                            </span>
                            {/* Icon */}
                            <span className="text-[#9C8878] shrink-0">
                              <CarrierIcon carrier={opt.carrier} />
                            </span>
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[13px] font-semibold text-[#1E1208]">{opt.label}</span>
                                {opt.tag && <span className={`text-[10px] font-bold tracking-[0.06em] uppercase px-2 py-0.5 rounded-full ${TAG[opt.tag]?.cls}`}>{TAG[opt.tag]?.label}</span>}
                              </div>
                              <p className="text-[11px] text-[#9C8878] mt-0.5">
                                {opt.estimatedDays === 0
                                  ? 'Entrega hoje'
                                  : `Recebe ${estimatedDate(opt.estimatedDays)}`}
                              </p>
                            </div>
                            {/* Preço */}
                            <span className={`text-sm font-bold shrink-0 ${opt.priceCents === 0 ? 'text-emerald-600' : 'text-[#1E1208]'}`}>
                              {opt.priceCents === 0 ? 'Grátis' : formatCurrency(opt.priceCents)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : step === 3 ? (
                    <p className="text-sm text-[#B09C8C]">Nenhuma opção de entrega disponível para o CEP informado.</p>
                  ) : null}
                </div>

                {/* Pagamento */}
                <div>
                  <p className="text-xs font-bold text-[#5A4535] tracking-[0.05em] uppercase mb-3">Forma de pagamento</p>
                  <div className="flex flex-col divide-y divide-[#E0D8CE] border border-[#E0D8CE] bg-white overflow-hidden">

                    {/* PIX */}
                    <button type="button" onClick={() => setPayMethod('pix')}
                      className={`flex items-center gap-4 w-full px-4 py-4 text-left transition-all ${payMethod === 'pix' ? 'bg-[#F2ECE5]' : 'hover:bg-[#F9F6F1]'}`}>
                      <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${payMethod === 'pix' ? 'border-[#1E1208]' : 'border-[#C8B8A8]'}`}>
                        {payMethod === 'pix' && <span className="w-2.5 h-2.5 rounded-full bg-[#1E1208]" />}
                      </span>
                      <div className="w-8 h-8 rounded-full bg-[#32BCAD]/10 flex items-center justify-center shrink-0">
                        <svg viewBox="0 0 512 512" className="w-5 h-5 fill-[#32BCAD]">
                          <path d="M112.57 391.19c20.056 0 38.928-7.808 53.12-21.996l74.122-74.122c5.27-5.27 14.636-5.266 19.9 0l74.455 74.455c14.192 14.188 33.064 21.996 53.12 21.996h14.638l-74.83 74.83-11.5 11.5c-14.192 14.188-33.064 21.996-53.12 21.996-20.056 0-38.928-7.808-53.12-21.996l-11.5-11.5-74.83-74.83h14.638zM112.57 120.81h-14.638l74.83 74.83 11.5 11.5c14.192 14.188 33.064 21.996 53.12 21.996 20.056 0 38.928-7.808 53.12-21.996l11.5-11.5 74.83-74.83H362.29c-20.056 0-38.928 7.808-53.12 21.996l-74.455 74.455c-5.264 5.266-14.63 5.27-19.9 0L140.69 142.806c-14.192-14.188-33.064-21.996-53.12-21.996z"/>
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-[#1E1208]">PIX</p>
                          {pixDiscount > 0 && (
                            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                              10% de desconto
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#9C8878] mt-0.5">
                          {pixDiscount > 0
                            ? `Economize ${formatCurrency(pixDiscount)} pagando com PIX`
                            : 'Aprovação instantânea'}
                        </p>
                      </div>
                    </button>

                    {/* Crédito */}
                    {creditTotal >= 10000 && (
                      <button type="button" onClick={() => setPayMethod('credit')}
                        className={`flex flex-col w-full px-4 py-4 text-left transition-all ${payMethod === 'credit' ? 'bg-[#F2ECE5]' : 'hover:bg-[#F9F6F1]'}`}>
                        <div className="flex items-center gap-4 w-full">
                          <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${payMethod === 'credit' ? 'border-[#1E1208]' : 'border-[#C8B8A8]'}`}>
                            {payMethod === 'credit' && <span className="w-2.5 h-2.5 rounded-full bg-[#1E1208]" />}
                          </span>
                          <div className="w-8 h-8 rounded-full bg-[#E6DFD5] flex items-center justify-center shrink-0">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#705A48" strokeWidth="1.8" strokeLinecap="round">
                              <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
                            </svg>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-[#1E1208]">Cartão de crédito</p>
                            <p className="text-xs text-[#9C8878] mt-0.5">Qualquer bandeira · até {Math.min(8, Math.floor(creditTotal / 10000))}x</p>
                          </div>
                        </div>

                        {/* Seletor de parcelas */}
                        {payMethod === 'credit' && maxInstall > 1 && (
                          <div className="mt-3 ml-9 pl-4">
                            <p className="text-[11px] font-semibold text-[#5A4535] mb-2">Em quantas vezes?</p>
                            <div className="flex flex-wrap gap-2">
                              {Array.from({ length: maxInstall }, (_, i) => i + 1).map(n => {
                                const val = Math.round(creditTotal / n);
                                return (
                                  <button key={n} type="button"
                                    onClick={e => { e.stopPropagation(); setInstall(n); }}
                                    className={`px-3 py-2 border text-xs font-medium transition-all ${
                                      installments === n
                                        ? 'border-[#1E1208] bg-[#1E1208] text-white'
                                        : 'border-[#E0D8CE] text-[#5A4535] hover:border-[#1E1208]/40'
                                    }`}
                                  >
                                    {n}x {formatCurrency(val)}
                                    {n === 1 && <span className="ml-1 text-[9px] opacity-60">à vista</span>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Resumo de valores (mobile repetition) */}
                <div className="border border-[#E0D8CE] bg-white p-4 lg:hidden">
                  <div className="flex flex-col gap-2 text-sm">
                    <div className="flex justify-between text-[#705A48]">
                      <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
                    </div>
                    {pixDiscount > 0 && payMethod === 'pix' && (
                      <div className="flex justify-between text-emerald-600 font-medium">
                        <span>Desconto PIX (10%)</span><span>-{formatCurrency(pixDiscount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-[#705A48]">
                      <span>Frete</span>
                      <span className={selectedShipping?.priceCents === 0 ? 'text-emerald-600 font-semibold' : ''}>
                        {selectedShipping ? (selectedShipping.priceCents === 0 ? 'Grátis' : formatCurrency(selectedShipping.priceCents)) : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between font-bold text-[#1E1208] pt-2 border-t border-[#E0D8CE] mt-1">
                      <span>Total</span><span>{formatCurrency(total)}</span>
                    </div>
                    {payMethod === 'credit' && installments > 1 && (
                      <p className="text-[11px] text-[#9C8878] text-right">{installments}x de {formatCurrency(installVal)}</p>
                    )}
                  </div>
                </div>

                {/* CTA — Trust signals adjacent */}
                <div className="flex flex-col gap-3">
                  {/* Trust inline — 18% higher completion rate (Baymard) */}
                  <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-[#9C8878]">
                    {[
                      { icon: '🔒', text: 'Criptografado SSL 256-bit' },
                      { icon: '⚡', text: 'PIX confirmado em segundos' },
                      { icon: '🔄', text: 'Troca em até 7 dias' },
                    ].map(({ icon, text }) => (
                      <span key={text}>{icon} {text}</span>
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || !selectedShipping}
                    className="flex items-center justify-center gap-2.5 w-full h-14 bg-[#1E1208] text-white text-[15px] font-bold tracking-[0.03em] hover:bg-[#7C5C3E] disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 active:scale-[0.99]"
                  >
                    {submitting
                      ? <><span className="spinner mr-1" />Gerando PIX…</>
                      : selectedShipping
                        ? <>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="opacity-80"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                            Pagar {formatCurrency(total)} com PIX
                          </>
                        : 'Selecione a entrega para continuar'
                    }
                  </button>
                </div>
              </div>
            </Section>

          </form>

          {/* ── Order summary sticky ── */}
          <div className="w-full hidden lg:block lg:sticky lg:top-[72px]">
            <div className="bg-white border border-[#E0D8CE]">
              {/* Header */}
              <div className="px-5 py-4 border-b border-[#E0D8CE] flex items-center justify-between">
                <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-[#9C8878]">Seu pedido</h2>
                <span className="text-xs text-[#B09C8C]">{totalItems} {totalItems === 1 ? 'item' : 'itens'}</span>
              </div>

              {/* Items */}
              <div className="px-5 py-4 flex flex-col gap-4">
                {items.map(item => (
                  <div key={item.sku} className="flex items-start gap-3">
                    <div className="relative shrink-0 w-12 h-14 bg-[#F9F6F1] border border-[#E0D8CE] overflow-hidden">
                      {item.image
                        ? <Image src={item.image} alt={item.productName} fill sizes="48px" className="object-cover" />
                        : <div className="h-full flex items-center justify-center text-[#C8B8A8] text-xs font-display">M</div>
                      }
                      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#1E1208] text-white text-[9px] font-bold flex items-center justify-center rounded-full">
                        {item.quantity}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[#1E1208] leading-snug line-clamp-2">{item.productName}</p>
                      {item.variant?.size && <p className="text-[11px] text-[#B09C8C] mt-0.5">{item.variant.size}</p>}
                    </div>
                    <span className="text-xs font-semibold text-[#1E1208] shrink-0">{formatCurrency(item.unitPrice * item.quantity)}</span>
                  </div>
                ))}
              </div>

              {/* Totais */}
              <div className="px-5 py-4 border-t border-[#E0D8CE] flex flex-col gap-2.5">
                <div className="flex justify-between text-sm text-[#705A48]">
                  <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
                </div>
                {pixDiscount > 0 && payMethod === 'pix' && (
                  <div className="flex justify-between text-sm text-emerald-600 font-medium">
                    <span>Desconto PIX (10%)</span><span>-{formatCurrency(pixDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-[#B09C8C]">Frete</span>
                  {shippingLoading
                    ? <span className="text-[#B09C8C] text-xs animate-pulse">calculando…</span>
                    : selectedShipping
                      ? <span className={selectedShipping.priceCents === 0 ? 'text-emerald-600 font-semibold text-xs' : 'text-[#1E1208]'}>
                          {selectedShipping.priceCents === 0 ? 'Grátis' : formatCurrency(selectedShipping.priceCents)}
                        </span>
                      : <span className="text-[#B09C8C] text-xs">a calcular</span>
                  }
                </div>
                {selectedShipping && (
                  <div className="flex justify-between text-xs text-[#B09C8C]">
                    <span>{selectedShipping.label}</span>
                    <span>{selectedShipping.estimatedDays === 0 ? 'hoje' : `${selectedShipping.estimatedDays} d.u.`}</span>
                  </div>
                )}
              </div>

              {/* Total */}
              <div className="px-5 py-4 border-t border-[#E0D8CE] flex justify-between items-center">
                <span className="text-sm font-bold text-[#1E1208]">Total</span>
                <div className="text-right">
                  <span className="font-display text-2xl text-[#1E1208]">{formatCurrency(total)}</span>
                  <p className="text-[10px] text-[#B09C8C]">
                    {payMethod === 'credit' && installments > 1
                      ? `${installments}x de ${formatCurrency(installVal)}`
                      : payMethod === 'pix' ? 'à vista no PIX' : 'em 1x no cartão'}
                  </p>
                </div>
              </div>

              {/* Trust */}
              <div className="px-5 pb-5 border-t border-[#E0D8CE] pt-4 flex flex-col gap-2">
                {[
                  'Pagamento 100% seguro via PIX',
                  'Confirmação automática em segundos',
                  'Nota fiscal emitida no pedido',
                  'Troca e devolução em até 7 dias',
                ].map(text => (
                  <div key={text} className="flex items-center gap-2 text-[11px] text-[#B09C8C]">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-emerald-500 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                    {text}
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function Crumb({ state, label }: { state: 'done' | 'active' | 'pending'; label: string }) {
  return (
    <span className={`flex items-center gap-1.5 shrink-0 ${state === 'pending' ? 'opacity-35' : ''}`}>
      {state === 'done' && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-emerald-600">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      )}
      <span className={`text-xs font-semibold hidden sm:block ${state === 'active' ? 'text-[#1E1208]' : state === 'done' ? 'text-[#9C8878]' : 'text-[#B09C8C]'}`}>
        {label}
      </span>
      {state === 'active' && <span className="sm:hidden text-xs font-bold text-[#1E1208]">{label}</span>}
    </span>
  );
}
function CrumbDivider() {
  return <span className="text-[#E0D8CE] text-xs shrink-0">/</span>;
}
