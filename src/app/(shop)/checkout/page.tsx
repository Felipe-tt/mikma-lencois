'use client';
import { Fragment, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot, getDoc, setDoc, collection, query, where, getDocs, documentId } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { formatCurrency } from '@/lib/utils/format';
import type { Cart, Address } from '@/types';
import { PIXModal } from '@/components/checkout/PIXModal';
import { CheckoutSkeleton } from '@/components/ui/Skeleton';
import { maskCep, maskCpf, maskPhone, onlyDigits, isValidCpf, isValidPhone, isValidCep, BR_STATES } from '@/lib/masks';
import { Select } from '@/components/ui/Select';
import type { ShippingOption } from '@/lib/shipping-pricing';
import Image from 'next/image';
import { trackBeginCheckout } from '@/lib/analytics';
import { computePixTotalCents, computeCardTotalCents, installmentFeeRate } from '@/lib/orderPricing';

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
  if (carrier === 'uber_direct') return (
    /* moto / scooter icon */
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={cls}><circle cx="5.5" cy="17.5" r="2.5"/><circle cx="18.5" cy="17.5" r="2.5"/><path d="M8 17.5h7M15 17.5V9l3 2 2-2"/><path d="M6 9l3-4h5l2 4"/><path d="M6 9h9"/></svg>
  );
  if (carrier.startsWith('jadlog')) return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={cls}><rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
  );
  // correios_pac, correios_sedex, outros
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={cls}><rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
  );
}

const TAG: Record<string, { label: string; cls: string }> = {
  rapido:    { label: 'Mais rápido',    cls: 'bg-ink/[0.06] text-ink' },
  economico: { label: 'Mais econômico', cls: 'bg-clay/10 text-clay' },
};

// ── Field components ─────────────────────────────────────────────────────────
function Label({ children, optional, htmlFor }: { children: React.ReactNode; optional?: boolean; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-semibold text-mid mb-1.5 tracking-[0.03em]">
      {children}
      {optional && <span className="ml-1.5 text-faint font-normal">opcional</span>}
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
  id, value, onChange, onBlur, placeholder, type = 'text', inputMode,
  maxLength, required, hasError, disabled, autoComplete,
}: {
  id?: string;
  value: string; onChange: (v: string) => void; onBlur?: () => void;
  placeholder?: string; type?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  maxLength?: number; required?: boolean; hasError?: boolean; disabled?: boolean; autoComplete?: string;
}) {
  const [touched, setTouched] = useState(false);
  const valid = !hasError && value.length > 0;
  return (
    <div className="relative">
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        aria-invalid={hasError && touched ? true : undefined}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onBlur={() => { setTouched(true); onBlur?.(); }}
        className={`w-full border px-3.5 py-3 text-sm text-ink placeholder:text-faint focus:outline-none transition-[border-color,box-shadow,background-color] duration-150 ${
          hasError && touched
            ? 'border-red-400 bg-red-50/40 focus:border-red-400 focus:ring-2 focus:ring-red-100'
            : valid
              ? 'border-emerald-400 bg-white dark:bg-warm focus:border-ink/40 focus:ring-2 focus:ring-ink/5'
              : 'border-mist bg-white dark:bg-warm focus:border-ink/40 focus:ring-2 focus:ring-ink/5'
        } disabled:bg-paper disabled:text-faint`}
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
  // Seção concluída e fechada: o cabeçalho inteiro vira o botão "Editar".
  const editable = !!done && !open && !!onEdit;
  const HeaderTag = editable ? 'button' : 'div';
  return (
    <div className={`border transition-colors ${open ? 'border-ink/20' : 'border-mist'}`}>
      <HeaderTag
        {...(editable ? { type: 'button' as const, onClick: onEdit, 'aria-label': `Editar ${label}` } : {})}
        className={`flex items-center gap-3 px-5 py-4 w-full text-left ${editable ? 'cursor-pointer hover:bg-paper/60 transition-colors' : ''}`}
      >
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
          done && !open ? 'bg-clay text-paper' :
          open          ? 'bg-ink text-paper' :
                          'border-2 border-mist text-faint'
        }`}>
          {done && !open
            ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            : num
          }
        </span>
        <div className="flex-1 min-w-0">
          <h2 className={`font-display font-normal text-[1.15rem] leading-none transition-colors ${open ? 'text-ink' : done ? 'text-mid' : 'text-faint'}`}>
            {label}
          </h2>
        </div>
        {editable && (
          <span aria-hidden className="text-xs font-semibold text-clay hover:text-clay-d transition-colors shrink-0">
            Editar
          </span>
        )}
      </HeaderTag>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CheckoutPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [cart, setCart]       = useState<Cart | null>(null);
  const [couponApplied, setCouponApplied] = useState<{ code: string; discount: number } | null>(null);
  const beginCheckoutTracked = useRef(false);
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
  const [pixData, setPixData] = useState<{ txId: string; qrCode: string; copyPaste: string; orderId: string; expiresAt?: string; totalCents?: number } | null>(null);
  // Com o PIX na tela, o carrinho esvazia quando o pagamento confirma.
  // Sem essa trava o listener abaixo mandava pro /carrinho e o cliente
  // nunca via o "Pagamento recebido".
  const pixShownRef = useRef(false);
  const apiErrorRef = useRef<HTMLDivElement>(null);
  // O erro aparece no topo do formulário e o botão de pagar fica no fim:
  // no celular parecia que nada tinha acontecido.
  useEffect(() => {
    if (apiError) apiErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [apiError]);
  const [payMethod, setPayMethod]     = useState<'pix' | 'credit'>('pix');
  const [installments, setInstall]    = useState(1);

  const [shippingOptions, setShipOpts]  = useState<ShippingOption[]>([]);
  const [selectedShipping, setSelShip]  = useState<ShippingOption | null>(null);
  const [shippingLoading, setShipLoad]  = useState(false);
  const [shippingError, setShipErr]     = useState('');
  const [quotedCep, setQuotedCep]       = useState('');

  // Configurações de desconto PIX vindas do servidor (painel → settings)
  const [pixThresholdCents, setPixThreshold] = useState(180000);
  const [pixDiscountPct, setPixDiscountPct]  = useState(10);


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
      if (!snap.exists() || !snap.data()?.items?.length) {
        if (!pixShownRef.current) router.push('/carrinho');
        return;
      }
      const c = snap.data() as Cart;
      setCart(c);
      setCL(false);
      if (!beginCheckoutTracked.current) {
        beginCheckoutTracked.current = true;
        trackBeginCheckout(
          c.items.map(i => ({ sku: i.sku, productId: i.productId, productName: i.productName, unitPriceCents: i.unitPrice, quantity: i.quantity })),
          c.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
        );
      }
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
    // Buscar configurações de desconto PIX do servidor
    fetch('/api/checkout/pix-discount')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setPixThreshold(d.pixDiscountThresholdCents);
          setPixDiscountPct(d.pixDiscountPct);
        }
      })
      .catch(() => { /* mantém defaults */ });
    return unsub;
  }, [user, loading, router]);

  useEffect(() => {
    if (isValidCep(addr.cep) && !quotedCep) quoteShipping(addr.cep);
  }, [addr.cep, quotedCep, quoteShipping]);

  // Produto pode ter sido desativado ou excluído do catálogo depois de já
  // estar no carrinho — sem essa checagem aqui, a pessoa preenchia o
  // checkout inteiro (endereço, entrega) só pra falhar no ultimo passo
  // (geração do pagamento). A pagina /carrinho ja bloqueia isso, então
  // só reenvia pra lá quando detecta um item indisponível.
  useEffect(() => {
    const items = cart?.items ?? [];
    if (items.length === 0) return;
    const productIds = Array.from(new Set(items.map(i => i.productId)));
    let cancelled = false;
    getDocs(query(collection(db, 'products'), where(documentId(), 'in', productIds.slice(0, 30))))
      .then(snap => {
        if (cancelled) return;
        const foundActive = new Set(snap.docs.filter(d => d.data().active !== false).map(d => d.id));
        const hasUnavailable = productIds.some(id => !foundActive.has(id));
        if (hasUnavailable) router.push('/carrinho');
      })
      .catch(() => { /* falha na checagem não deve travar o checkout */ });
    return () => { cancelled = true; };
  }, [cart, router]);

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
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? 'Erro ao gerar PIX. Tente novamente.');
        pixShownRef.current = true;
        setPixData(data);
      } else {
        const res = await fetch('/api/payment/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ address: addr, shipping: selectedShipping, installments }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error ?? 'Erro ao gerar checkout. Tente novamente.');
        window.location.href = d.checkoutUrl;
      }
    } catch (err: unknown) {
      setApiErr(err instanceof Error ? err.message : 'Erro ao finalizar pedido.');
    } finally { setSub(false); }
  }

  const items       = cart?.items ?? [];
  const subtotal    = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const shipCents   = selectedShipping?.priceCents ?? 0;
  const PIX_DISCOUNT_THRESHOLD = pixThresholdCents;
  const pixDiscount  = pixThresholdCents > 0 && subtotal >= PIX_DISCOUNT_THRESHOLD ? Math.round(subtotal * (pixDiscountPct / 100)) : 0;
  // Mesmas funções que o servidor usa pra cobrar (lib/orderPricing): antes
  // esta tela ignorava o cupom do carrinho e os juros do parcelamento, e o
  // valor cobrado saía diferente do mostrado.
  const couponDiscount = couponApplied && couponApplied.code === (cart?.couponCode ?? null) ? couponApplied.discount : 0;
  const pixTotal     = computePixTotalCents({ productsCents: subtotal, pixDiscountCents: pixDiscount, couponDiscountCents: couponDiscount, shippingCents: shipCents });
  const cardTotalFor = (n: number) => computeCardTotalCents({ productsCents: subtotal, couponDiscountCents: couponDiscount, shippingCents: shipCents, feeRate: installmentFeeRate(n) });
  const creditBase   = cardTotalFor(1);
  const creditTotal  = cardTotalFor(installments);
  const creditFees   = creditTotal - creditBase;
  const total        = payMethod === 'pix' ? pixTotal : creditTotal;
  const totalItems   = items.reduce((s, i) => s + i.quantity, 0);
  // Parcelamento: mín R$100/parcela, máx 8x
  const maxInstall   = Math.min(8, Math.floor(creditBase / 10000));
  const installVal   = Math.round(creditTotal / installments);

  // Cupom aplicado no carrinho: revalida com o mesmo endpoint do carrinho
  // (e a mesma regra das rotas de pagamento) pra mostrar o desconto real.
  const cartCoupon = cart?.couponCode ?? null;
  useEffect(() => {
    if (!user || !cartCoupon || subtotal <= 0) return;
    let cancelled = false;
    user.getIdToken().then(token => fetch('/api/checkout/validate-coupon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code: cartCoupon, orderCents: subtotal }),
    })).then(async res => {
      if (cancelled) return;
      const data = await res.json().catch(() => ({}));
      setCouponApplied(res.ok ? { code: cartCoupon, discount: data.discountCents ?? 0 } : null);
    }).catch(() => { if (!cancelled) setCouponApplied(null); });
    return () => { cancelled = true; };
  }, [user, cartCoupon, subtotal]);

  if (loading || cartLoading) return <CheckoutSkeleton />;
  if (pixData) return (
    <PIXModal
      qrCode={pixData.qrCode}
      copyPaste={pixData.copyPaste}
      orderId={pixData.orderId}
      totalCents={pixData.totalCents ?? total}
      expiresAt={pixData.expiresAt}
      onClose={() => router.push('/conta/pedidos')}
    />
  );

  return (
    <div className="min-h-screen bg-paper">

      {/* ── Top bar ── */}
      <div className="bg-white dark:bg-warm border-b border-mist sticky top-0 z-20">
        <div className="container-shop h-14 flex items-center justify-between gap-4">
          {/* Celular: etapa atual + barra de progresso. As 4 etapas com
              rótulo não cabem e só sobravam barras soltas. */}
          <div className="sm:hidden flex items-center justify-between gap-4 w-full">
            <span key={step} className="text-[13px] font-semibold text-ink animate-fade-in">{STEP_LABELS[step - 1]}</span>
            <span className="flex items-center gap-2.5 shrink-0" aria-label={`Etapa ${step} de 3`}>
              <span className="font-mono text-[11px] text-faint tabular-nums">{step}/3</span>
              <span className="flex gap-1" aria-hidden="true">
                {[1, 2, 3].map(n => (
                  <span key={n} className={`h-1 w-6 transition-colors duration-300 ${n <= step ? 'bg-ink' : 'bg-mist'}`} />
                ))}
              </span>
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-3">
            <Crumb state="done" label="Carrinho" />
            <CrumbDivider />
            {STEP_LABELS.map((label, i) => {
              const n = i + 1;
              return (
                <Fragment key={label}>
                  <Crumb state={step > n ? 'done' : step === n ? 'active' : 'pending'} label={label} />
                  {n < 3 && <CrumbDivider />}
                </Fragment>
              );
            })}
          </div>

        </div>
      </div>

      <div className="container-shop py-6 sm:py-10">
        <div className="flex flex-col lg:grid lg:grid-cols-[1fr_400px] gap-6 lg:gap-12 items-start">

          {/* ── Formulário accordion ── */}
          <form onSubmit={submit} className="flex flex-col gap-3 w-full">

            {apiError && (
              <div ref={apiErrorRef} role="alert" className="scroll-mt-20 flex items-start gap-3 border border-red-200 bg-red-50 text-red-700 px-4 py-3.5 text-sm rounded-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 mt-px text-red-500"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                {apiError}
              </div>
            )}

            {/* ── Seção 1: Identificação ── */}
            <Section num={1} label="Identificação" open={step === 1} done={s1done} onEdit={() => setStep(1)}>
              <div className="flex flex-col gap-4">
                <div>
                  <Label htmlFor="co-name">Nome completo</Label>
                  <Input id="co-name" value={customer.name} onChange={v => setCustomer(c => ({ ...c, name: v }))}
                    placeholder="Como consta no documento" required hasError={!!errors.name}
                    autoComplete="name" />
                  <Err msg={errors.name} />
                </div>
                <div className="grid grid-cols-1 min-[440px]:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="co-cpf">CPF</Label>
                    <Input id="co-cpf" value={customer.cpf} onChange={v => setCustomer(c => ({ ...c, cpf: maskCpf(v) }))}
                      inputMode="numeric" maxLength={14} placeholder="000.000.000-00"
                      required hasError={!!errors.cpf} autoComplete="off" />
                    <Err msg={errors.cpf} />
                  </div>
                  <div>
                    <Label htmlFor="co-phone">Celular / WhatsApp</Label>
                    <Input id="co-phone" value={customer.phone} onChange={v => setCustomer(c => ({ ...c, phone: maskPhone(v) }))}
                      type="tel" maxLength={15} placeholder="(47) 99999-0000"
                      required hasError={!!errors.phone} autoComplete="tel" />
                    <Err msg={errors.phone} />
                  </div>
                </div>
                <button type="button" onClick={advanceToStep2}
                  className="w-full h-12 bg-ink text-paper text-sm font-bold tracking-[0.05em] hover:bg-mid transition-colors mt-1">
                  Continuar para endereço
                </button>
              </div>
            </Section>

            {/* ── Seção 2: Endereço ── */}
            <Section num={2} label="Endereço de entrega" open={step === 2} done={s2done} onEdit={() => setStep(2)}>
              <div className="flex flex-col gap-4">
                {/* CEP */}
                <div>
                  <Label htmlFor="co-cep">CEP</Label>
                  <div className="relative">
                    <Input id="co-cep" value={addr.cep} onChange={v => {
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
                  <Label htmlFor="co-street">Logradouro</Label>
                  <Input id="co-street" value={addr.street} onChange={v => setAddr(a => ({ ...a, street: v }))}
                    placeholder="Rua, Avenida, Travessa…" required hasError={!!errors.street} autoComplete="address-line1" />
                  <Err msg={errors.street} />
                </div>
                {/* Número + Complemento */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="co-number">Número</Label>
                    <Input id="co-number" value={addr.number} onChange={v => setAddr(a => ({ ...a, number: v }))}
                      placeholder="123 ou S/N" required hasError={!!errors.number} autoComplete="off" />
                    <Err msg={errors.number} />
                  </div>
                  <div>
                    <Label optional htmlFor="co-complement">Complemento</Label>
                    <Input id="co-complement" value={addr.complement ?? ''} onChange={v => setAddr(a => ({ ...a, complement: v }))}
                      placeholder="Apto, bloco…" autoComplete="address-line3" />
                  </div>
                </div>
                {/* Bairro */}
                <div>
                  <Label htmlFor="co-neighborhood">Bairro</Label>
                  <Input id="co-neighborhood" value={addr.neighborhood} onChange={v => setAddr(a => ({ ...a, neighborhood: v }))}
                    required hasError={!!errors.neighborhood} autoComplete="address-level3" />
                  <Err msg={errors.neighborhood} />
                </div>
                {/* Cidade + UF */}
                <div className="grid grid-cols-[1fr_96px] gap-3">
                  <div>
                    <Label htmlFor="co-city">Cidade</Label>
                    <Input id="co-city" value={addr.city} onChange={v => setAddr(a => ({ ...a, city: v }))}
                      required hasError={!!errors.city} autoComplete="address-level2" />
                    <Err msg={errors.city} />
                  </div>
                  <div>
                    <Label htmlFor="co-state">UF</Label>
                    <Select
                      triggerId="co-state"
                      name="state"
                      value={addr.state}
                      onChange={v => setAddr(a => ({ ...a, state: v }))}
                      options={[{ value: '', label: '--' }, ...BR_STATES.map(uf => ({ value: uf, label: uf }))]}
                      triggerClassName={`w-full border px-3 py-3 text-sm bg-white dark:bg-warm focus:outline-none focus:ring-2 transition-all flex items-center justify-between gap-2 rounded-[2px] cursor-pointer ${errors.state ? 'border-red-400 focus:ring-red-100' : 'border-mist hover:border-ink/20 focus:border-ink/40 focus:ring-ink/5'}`}
                    />
                    <Err msg={errors.state} />
                  </div>
                </div>
                <button type="button" onClick={advanceToStep3}
                  className="w-full h-12 bg-ink text-paper text-sm font-bold tracking-[0.05em] hover:bg-mid transition-colors mt-1">
                  Continuar para entrega
                </button>
              </div>
            </Section>

            {/* ── Seção 3: Entrega + Pagamento ── */}
            <Section num={3} label="Entrega e pagamento" open={step === 3} done={false}>
              <div className="flex flex-col gap-6">

                {/* Opções de frete */}
                <div>
                  <p className="text-xs font-bold text-mid tracking-[0.05em] uppercase mb-3">Opção de entrega</p>
                  {shippingLoading ? (
                    <div className="flex items-center gap-3 border border-mist bg-white dark:bg-warm px-4 py-4 text-sm text-faint">
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
                    <div role="radiogroup" aria-label="Opção de entrega" className="flex flex-col divide-y divide-mist border border-mist bg-white dark:bg-warm overflow-hidden">
                      {shippingOptions.map(opt => {
                        const sel = selectedShipping?.carrier === opt.carrier;
                        return (
                          <button
                            key={opt.carrier}
                            type="button"
                            role="radio"
                            aria-checked={sel}
                            onClick={() => setSelShip(opt)}
                            className={`flex items-center gap-4 w-full px-4 py-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 ${sel ? 'bg-warm' : 'hover:bg-paper'}`}
                          >
                            {/* Radio */}
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${sel ? 'border-ink' : 'border-faint-l'}`}>
                              {sel && <span className="w-2.5 h-2.5 rounded-full bg-ink" />}
                            </span>
                            {/* Icon */}
                            <span className="text-faint shrink-0">
                              <CarrierIcon carrier={opt.carrier} />
                            </span>
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[13px] font-semibold text-ink">{opt.label}</span>
                                {opt.tag && opt.tag !== 'local' && <span className={`text-[10px] font-bold tracking-[0.06em] uppercase px-2 py-0.5 ${TAG[opt.tag]?.cls}`}>{TAG[opt.tag]?.label}</span>}
                              </div>
                              <p className="text-[11px] text-faint mt-0.5">
                                {opt.carrier === 'pickup'
                                  ? 'Pronto pra retirar hoje, no horário da loja'
                                  : opt.estimatedDays === 0
                                  ? 'Chega hoje'
                                  : `Recebe ${estimatedDate(opt.estimatedDays)}`}
                              </p>
                            </div>
                            {/* Preço */}
                            <span className={`text-sm font-bold shrink-0 ${opt.priceCents === 0 ? 'text-emerald-600' : 'text-ink'}`}>
                              {opt.priceCents === 0 ? 'Grátis' : formatCurrency(opt.priceCents)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : step === 3 ? (
                    <p className="text-sm text-faint">Nenhuma opção de entrega disponível para o CEP informado.</p>
                  ) : null}
                </div>

                {/* Pagamento */}
                <div>
                  <p className="text-xs font-bold text-mid tracking-[0.05em] uppercase mb-3">Forma de pagamento</p>
                  <div role="radiogroup" aria-label="Forma de pagamento" className="flex flex-col divide-y divide-mist border border-mist bg-white dark:bg-warm overflow-hidden">

                    {/* PIX */}
                    <button type="button" role="radio" aria-checked={payMethod === 'pix'} onClick={() => setPayMethod('pix')}
                      className={`flex items-center gap-4 w-full px-4 py-4 text-left transition-all ${payMethod === 'pix' ? 'bg-warm' : 'hover:bg-paper'}`}>
                      <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${payMethod === 'pix' ? 'border-ink' : 'border-faint-l'}`}>
                        {payMethod === 'pix' && <span className="w-2.5 h-2.5 rounded-full bg-ink" />}
                      </span>
                      <div className="w-8 h-8 rounded-full bg-[#32BCAD]/10 flex items-center justify-center shrink-0">
                        <svg viewBox="0 0 512 512" className="w-5 h-5 fill-[#32BCAD]">
                          <path d="M242.4 292.5C247.8 287.1 257.1 287.1 262.5 292.5L339.5 369.5C353.7 383.7 372.6 391.5 392.6 391.5H407.7L310.6 488.6C280.3 518.1 231.1 518.1 200.8 488.6L103.3 391.2H112.6C132.6 391.2 151.5 383.4 165.7 369.2L242.4 292.5zM262.5 218.9C256.1 224.4 247.9 224.5 242.4 218.9L165.7 142.2C151.5 127.1 132.6 120.2 112.6 120.2H103.3L200.7 22.76C231.1-7.586 280.3-7.586 310.6 22.76L407.8 119.9H392.6C372.6 119.9 353.7 127.7 339.5 141.9L262.5 218.9zM112.6 142.7C126.4 142.7 139.1 148.3 149.7 158.1L226.4 234.8C233.6 241.1 243 245.6 252.5 245.6C261.9 245.6 271.3 241.1 278.5 234.8L355.5 157.8C365.3 148.1 378.8 142.5 392.6 142.5H430.3L488.6 200.8C518.9 231.1 518.9 280.3 488.6 310.6L430.3 368.9H392.6C378.8 368.9 365.3 363.3 355.5 353.5L278.5 276.5C264.6 262.6 240.3 262.6 226.4 276.6L149.7 353.2C139.1 363 126.4 368.6 112.6 368.6H80.78L22.76 310.6C-7.586 280.3-7.586 231.1 22.76 200.8L80.78 142.7H112.6z"/>
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-ink">PIX</p>
                          {pixDiscount > 0 && (
                            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5">
                              {pixDiscountPct}% de desconto
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-faint mt-0.5">
                          {pixDiscount > 0
                            ? `Economize ${formatCurrency(pixDiscount)} pagando com PIX`
                            : 'Aprovação instantânea'}
                        </p>
                      </div>
                    </button>

                    {/* Crédito */}
                    {creditBase >= 10000 && (
                      <div className={`transition-colors ${payMethod === 'credit' ? 'bg-warm' : ''}`}>
                      <button type="button" role="radio" aria-checked={payMethod === 'credit'} onClick={() => setPayMethod('credit')}
                        className={`flex flex-col w-full px-4 py-4 text-left transition-colors ${payMethod === 'credit' ? '' : 'hover:bg-paper'}`}>
                        <div className="flex items-center gap-4 w-full">
                          <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${payMethod === 'credit' ? 'border-ink' : 'border-faint-l'}`}>
                            {payMethod === 'credit' && <span className="w-2.5 h-2.5 rounded-full bg-ink" />}
                          </span>
                          <div className="w-8 h-8 rounded-full bg-mist flex items-center justify-center shrink-0">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#705A48" strokeWidth="1.8" strokeLinecap="round">
                              <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
                            </svg>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-ink">Cartão de crédito</p>
                            <p className="text-xs text-faint mt-0.5">Qualquer bandeira · até {maxInstall}x</p>
                          </div>
                        </div>
                      </button>

                        {/* Seletor de parcelas: fora do botão do cartão (botão dentro de botão é inválido) */}
                        {payMethod === 'credit' && maxInstall > 1 && (
                          <div className="pb-4 px-4 ml-9 pl-4">
                            <p id="installments-label" className="text-[11px] font-semibold text-mid mb-2">Em quantas vezes?</p>
                            <div role="radiogroup" aria-labelledby="installments-label" className="flex flex-wrap gap-2">
                              {Array.from({ length: maxInstall }, (_, i) => i + 1).map(n => {
                                const val = Math.round(cardTotalFor(n) / n);
                                const noFee = installmentFeeRate(n) === 0;
                                return (
                                  <button key={n} type="button" role="radio" aria-checked={installments === n}
                                    onClick={() => setInstall(n)}
                                    className={`px-3 py-2 border text-xs font-medium active:scale-[0.97] transition-[background-color,border-color,color,transform] duration-150 ${
                                      installments === n
                                        ? 'border-ink bg-ink text-paper'
                                        : 'border-mist text-mid hover:border-ink/40'
                                    }`}
                                  >
                                    {n}x {formatCurrency(val)}
                                    {n === 1
                                      ? <span className="ml-1 text-[9px] opacity-60">à vista</span>
                                      : noFee && <span className="ml-1 text-[9px] opacity-60">sem juros</span>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Resumo de valores (mobile repetition) */}
                <div className="border border-mist bg-white dark:bg-warm p-4 lg:hidden">
                  <div className="flex flex-col gap-2 text-sm">
                    <div className="flex justify-between text-mid">
                      <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
                    </div>
                    {pixDiscount > 0 && payMethod === 'pix' && (
                      <div className="flex justify-between text-emerald-600 font-medium">
                        <span>Desconto PIX ({pixDiscountPct}%)</span><span>-{formatCurrency(pixDiscount)}</span>
                      </div>
                    )}
                    {couponDiscount > 0 && (
                      <div className="flex justify-between text-emerald-600 font-medium">
                        <span>Cupom {couponApplied?.code}</span><span>-{formatCurrency(couponDiscount)}</span>
                      </div>
                    )}
                    {payMethod === 'credit' && creditFees > 0 && (
                      <div className="flex justify-between text-mid">
                        <span>Juros ({installments}x)</span><span>+{formatCurrency(creditFees)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-mid">
                      <span>Frete</span>
                      <span className={selectedShipping?.priceCents === 0 ? 'text-emerald-600 font-semibold' : ''}>
                        {selectedShipping ? (selectedShipping.priceCents === 0 ? 'Grátis' : formatCurrency(selectedShipping.priceCents)) : '-'}
                      </span>
                    </div>
                    <div className="flex justify-between font-bold text-ink pt-2 border-t border-mist mt-1">
                      <span>Total</span><span>{formatCurrency(total)}</span>
                    </div>
                    {payMethod === 'credit' && installments > 1 && (
                      <p className="text-[11px] text-faint text-right">{installments}x de {formatCurrency(installVal)}</p>
                    )}
                  </div>
                </div>

                {/* CTA, Trust signals adjacent */}
                <div className="flex flex-col gap-3">
                  {/* Trust inline, 18% higher completion rate (Baymard) */}
                  <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-faint">
                    <span>PIX confirmado em segundos</span>
                    <span>Troca em até 7 dias</span>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || !selectedShipping}
                    className="flex items-center justify-center gap-2.5 w-full h-14 bg-ink text-paper text-[15px] font-bold tracking-[0.03em] hover:bg-mid disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 active:scale-[0.99]"
                  >
                    {submitting
                      ? <><span className="spinner mr-1" />{payMethod === 'credit' ? 'Redirecionando…' : 'Gerando PIX…'}</>
                      : selectedShipping
                        ? payMethod === 'credit'
                          ? <>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="opacity-80"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                              Pagar {formatCurrency(total)} com cartão
                            </>
                          : <>
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
            <div className="bg-white dark:bg-warm border border-mist">
              {/* Header */}
              <div className="px-5 py-4 border-b border-mist flex items-center justify-between">
                <h2 className="font-sans text-[10px] font-bold tracking-[0.2em] uppercase text-faint">Seu pedido</h2>
                <span className="text-xs text-faint">{totalItems} {totalItems === 1 ? 'item' : 'itens'}</span>
              </div>

              {/* Items */}
              <div className="px-5 py-4 flex flex-col gap-4">
                {items.map(item => (
                  <div key={item.note ? `${item.sku}::${item.note}` : item.sku} className="flex items-start gap-3">
                    {/* Badge de quantidade fora do overflow-hidden da foto: dentro dele
                        o canto era cortado e o número sumia. */}
                    <div className="relative shrink-0 w-12 h-14">
                      <div className="absolute inset-0 bg-paper border border-mist overflow-hidden">
                        {item.image
                          ? <Image src={item.image} alt={item.productName} fill sizes="48px" className="object-cover" />
                          : <div className="h-full flex items-center justify-center text-faint text-xs font-display">M</div>
                        }
                      </div>
                      <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 bg-ink text-paper text-[10px] font-bold tabular-nums flex items-center justify-center rounded-full ring-2 ring-paper">
                        {item.quantity}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-ink leading-snug line-clamp-2">{item.productName}</p>
                      {item.variant?.size && <p className="text-[11px] text-faint mt-0.5">{item.variant.size}</p>}
                      {item.note && <p className="text-[11px] text-clay font-medium mt-0.5">{item.note}</p>}
                    </div>
                    <span className="text-xs font-semibold text-ink shrink-0">{formatCurrency(item.unitPrice * item.quantity)}</span>
                  </div>
                ))}
              </div>

              {/* Totais */}
              <div className="px-5 py-4 border-t border-mist flex flex-col gap-2.5">
                <div className="flex justify-between text-sm text-mid">
                  <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
                </div>
                {pixDiscount > 0 && payMethod === 'pix' && (
                  <div className="flex justify-between text-sm text-emerald-600 font-medium">
                    <span>Desconto PIX ({pixDiscountPct}%)</span><span>-{formatCurrency(pixDiscount)}</span>
                  </div>
                )}
                {couponDiscount > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600 font-medium">
                    <span>Cupom {couponApplied?.code}</span><span>-{formatCurrency(couponDiscount)}</span>
                  </div>
                )}
                {payMethod === 'credit' && creditFees > 0 && (
                  <div className="flex justify-between text-sm text-mid">
                    <span>Juros ({installments}x)</span><span>+{formatCurrency(creditFees)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-faint">Frete</span>
                  {shippingLoading
                    ? <span className="text-faint text-xs animate-pulse">calculando…</span>
                    : selectedShipping
                      ? <span className={selectedShipping.priceCents === 0 ? 'text-emerald-600 font-semibold text-xs' : 'text-ink'}>
                          {selectedShipping.priceCents === 0 ? 'Grátis' : formatCurrency(selectedShipping.priceCents)}
                        </span>
                      : <span className="text-faint text-xs">a calcular</span>
                  }
                </div>
                {selectedShipping && (
                  <div className="flex justify-between text-xs text-faint">
                    <span>{selectedShipping.label}</span>
                    <span>{selectedShipping.estimatedDays === 0 ? 'hoje' : `${selectedShipping.estimatedDays} d.u.`}</span>
                  </div>
                )}
              </div>

              {/* Total */}
              <div className="px-5 py-4 border-t border-mist flex justify-between items-center">
                <span className="text-sm font-bold text-ink">Total</span>
                <div className="text-right">
                  <span className="font-display text-2xl text-ink">{formatCurrency(total)}</span>
                  <p className="text-[10px] text-faint">
                    {payMethod === 'credit' && installments > 1
                      ? `${installments}x de ${formatCurrency(installVal)}`
                      : payMethod === 'pix' ? 'à vista no PIX' : 'em 1x no cartão'}
                  </p>
                </div>
              </div>

              {/* Info objetiva, prazo e política */}
              <div className="px-5 pb-5 border-t border-mist pt-4 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[11px] text-faint">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                  Troca e devolução em até 7 dias
                </div>
                <div className="flex items-center gap-2 text-[11px] text-faint">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                  PIX confirmado em segundos
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

const STEP_LABELS = ['Identificação', 'Endereço', 'Entrega e pagamento'] as const;

function Crumb({ state, label }: { state: 'done' | 'active' | 'pending'; label: string }) {
  return (
    <span aria-current={state === 'active' ? 'step' : undefined} className={`flex items-center gap-1.5 shrink-0 transition-opacity duration-200 ${state === 'pending' ? 'opacity-40' : ''}`}>
      {state === 'done' && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-emerald-600">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      )}
      <span className={`text-xs font-semibold transition-colors duration-200 ${state === 'active' ? 'text-ink' : 'text-faint'}`}>
        {label}
      </span>
    </span>
  );
}
function CrumbDivider() {
  return <span className="text-mist text-xs shrink-0">/</span>;
}
