'use client';
import { useEffect, useState, useCallback } from 'react';
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

interface CustomerData { name: string; cpf: string; phone: string }

// ── Carrier icons ──
function CarrierIcon({ carrier }: { carrier: string }) {
  if (carrier === 'uber_direct') return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-black"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
  );
  if (carrier === 'disk_tenha') return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
  );
  if (carrier.startsWith('correios')) return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="w-4 h-4"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
  );
  if (carrier === 'total_express') return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="w-4 h-4"><rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
  );
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="w-4 h-4"><rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
  );
}

const TAG_LABEL: Record<string, string> = { local: 'Entrega hoje', rapido: 'Mais rápido', economico: 'Mais econômico' };
const TAG_COLOR: Record<string, string> = {
  local:     'bg-green-100 text-green-800',
  rapido:    'bg-amber-100 text-amber-800',
  economico: 'bg-blue-100 text-blue-800',
};

export default function CheckoutPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [cart, setCart]       = useState<Cart | null>(null);
  const [cartLoading, setCL]  = useState(true);
  const [addr, setAddr]       = useState<Address>({ cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' });
  const [customer, setCustomer] = useState<CustomerData>({ name: '', cpf: '', phone: '' });
  const [cepLoading, setCepL] = useState(false);
  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [apiError, setApiErr] = useState('');
  const [submitting, setSub]  = useState(false);
  const [pixData, setPixData] = useState<{ txId: string; qrCode: string; copyPaste: string; orderId: string; expiresAt?: string } | null>(null);

  const [shippingOptions, setShipOpts]  = useState<ShippingOption[]>([]);
  const [selectedShipping, setSelShip]  = useState<ShippingOption | null>(null);
  const [shippingLoading, setShipLoad]  = useState(false);
  const [shippingError, setShipErr]     = useState('');
  const [quotedCep, setQuotedCep]       = useState('');

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
      setCustomer({ name: d?.name ?? user.displayName ?? '', cpf: d?.cpf ?? '', phone: d?.phone ?? '' });
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
    if (!selectedShipping)             e.shipping = 'Selecione uma opção de entrega';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate() || !user || !cart || !selectedShipping) return;
    setSub(true); setApiErr('');
    try {
      const token = await auth.currentUser!.getIdToken();
      await setDoc(doc(db, 'users', user.uid), {
        address: addr, name: customer.name,
        cpf: onlyDigits(customer.cpf), phone: onlyDigits(customer.phone),
      }, { merge: true });
      const res = await fetch('/api/payment/create-pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ address: addr, shipping: selectedShipping }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Erro ao gerar PIX');
      setPixData(await res.json());
    } catch (err: unknown) {
      setApiErr(err instanceof Error ? err.message : 'Erro ao finalizar pedido. Tente novamente.');
    } finally { setSub(false); }
  }

  const items      = cart?.items ?? [];
  const subtotal   = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const shipCents  = selectedShipping?.priceCents ?? 0;
  const total      = subtotal + shipCents;
  const totalItems = items.reduce((s, i) => s + i.quantity, 0);

  function inputCls(key: string) {
    return `w-full border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition-colors ${
      errors[key]
        ? 'border-red-400 bg-red-50/30 focus:ring-red-100'
        : 'border-mist focus:border-ink/30 focus:ring-ink/5'
    }`;
  }

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
    <div className="min-h-screen bg-white">

      {/* ── Steps ── */}
      <div className="border-b border-mist bg-paper">
        <div className="container-shop py-3.5 flex items-center gap-2">
          <Step state="done" label="Carrinho" num={1} />
          <StepLine done />
          <Step state="active" label="Dados e entrega" num={2} />
          <StepLine />
          <Step state="pending" label="Pagamento PIX" num={3} />
        </div>
      </div>

      <div className="container-shop py-8 pb-24">
        <div className="flex flex-col lg:grid lg:grid-cols-[1fr_360px] gap-10 lg:gap-14 items-start">

          {/* ── Formulário ── */}
          <form onSubmit={submit} className="flex flex-col gap-10 w-full">

            {apiError && (
              <div className="flex items-start gap-3 border border-red-200 bg-red-50 text-red-700 px-4 py-3.5 text-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {apiError}
              </div>
            )}

            {/* ── Bloco 1: Dados pessoais ── */}
            <div>
              <BlockHeader num={1} label="Identificação" />
              <div className="flex flex-col gap-4 mt-5">
                <div>
                  <Label>Nome completo</Label>
                  <input type="text" required value={customer.name}
                    onChange={e => setCustomer(c => ({ ...c, name: e.target.value }))}
                    className={inputCls('name')} placeholder="Como no RG ou CPF" />
                  <FieldError msg={errors.name} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>CPF</Label>
                    <input type="text" required value={customer.cpf} inputMode="numeric"
                      onChange={e => setCustomer(c => ({ ...c, cpf: maskCpf(e.target.value) }))}
                      className={inputCls('cpf')} placeholder="000.000.000-00" maxLength={14} />
                    <FieldError msg={errors.cpf} />
                  </div>
                  <div>
                    <Label>WhatsApp / Celular</Label>
                    <input type="tel" required value={customer.phone}
                      onChange={e => setCustomer(c => ({ ...c, phone: maskPhone(e.target.value) }))}
                      className={inputCls('phone')} placeholder="(47) 99999-0000" maxLength={15} />
                    <FieldError msg={errors.phone} />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Bloco 2: Endereço ── */}
            <div>
              <BlockHeader num={2} label="Endereço de entrega" />
              <div className="flex flex-col gap-4 mt-5">
                {/* CEP */}
                <div>
                  <Label>CEP</Label>
                  <div className="relative">
                    <input type="text" required value={addr.cep} inputMode="numeric"
                      onChange={e => {
                        const v = maskCep(e.target.value);
                        setAddr(a => ({ ...a, cep: v }));
                        if (onlyDigits(v).length === 8) lookupCep(v);
                      }}
                      className={inputCls('cep')} placeholder="00000-000" maxLength={9}
                    />
                    {(cepLoading || shippingLoading) && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2">
                        <span className="spinner" />
                      </span>
                    )}
                  </div>
                  <FieldError msg={errors.cep} />
                </div>

                {/* Rua */}
                <div>
                  <Label>Logradouro</Label>
                  <input type="text" required value={addr.street}
                    onChange={e => setAddr(a => ({ ...a, street: e.target.value }))}
                    className={inputCls('street')} placeholder="Rua, Avenida, Travessa…" />
                  <FieldError msg={errors.street} />
                </div>

                {/* Número + Complemento */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Número</Label>
                    <input type="text" required value={addr.number}
                      onChange={e => setAddr(a => ({ ...a, number: e.target.value }))}
                      className={inputCls('number')} placeholder="123 ou S/N" />
                    <FieldError msg={errors.number} />
                  </div>
                  <div>
                    <Label optional>Complemento</Label>
                    <input type="text" value={addr.complement ?? ''}
                      onChange={e => setAddr(a => ({ ...a, complement: e.target.value }))}
                      className={inputCls('complement')} placeholder="Apto, bloco, casa…" />
                  </div>
                </div>

                {/* Bairro */}
                <div>
                  <Label>Bairro</Label>
                  <input type="text" required value={addr.neighborhood}
                    onChange={e => setAddr(a => ({ ...a, neighborhood: e.target.value }))}
                    className={inputCls('neighborhood')} />
                  <FieldError msg={errors.neighborhood} />
                </div>

                {/* Cidade + Estado */}
                <div className="grid grid-cols-[1fr_100px] gap-4">
                  <div>
                    <Label>Cidade</Label>
                    <input type="text" required value={addr.city}
                      onChange={e => setAddr(a => ({ ...a, city: e.target.value }))}
                      className={inputCls('city')} />
                    <FieldError msg={errors.city} />
                  </div>
                  <div>
                    <Label>UF</Label>
                    <div className="relative">
                      <select value={addr.state} required
                        onChange={e => setAddr(a => ({ ...a, state: e.target.value }))}
                        className={`w-full border px-3 py-2.5 text-sm appearance-none focus:outline-none ${errors.state ? 'border-red-400' : 'border-mist focus:border-ink/30'}`}
                      >
                        <option value="">UF</option>
                        {BR_STATES.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                      </select>
                      <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                    </div>
                    <FieldError msg={errors.state} />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Bloco 3: Frete ── */}
            <div>
              <BlockHeader num={3} label="Entrega" />
              <div className="mt-5">
                {!isValidCep(addr.cep) ? (
                  <div className="border border-dashed border-mist px-4 py-5 text-center">
                    <p className="text-sm text-faint">Preencha o CEP acima para ver as opções de entrega disponíveis.</p>
                  </div>
                ) : shippingLoading ? (
                  <div className="border border-mist px-4 py-5 flex items-center gap-3 text-sm text-mid">
                    <span className="spinner shrink-0" />
                    Calculando opções de entrega para o CEP {addr.cep}…
                  </div>
                ) : shippingError ? (
                  <div className="border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-600">
                    {shippingError}
                    <button onClick={() => quoteShipping(addr.cep)} className="ml-3 underline text-red-700 font-medium">Tentar novamente</button>
                  </div>
                ) : shippingOptions.length > 0 ? (
                  <div className="flex flex-col divide-y divide-mist border border-mist">
                    {shippingOptions.map(opt => {
                      const selected = selectedShipping?.carrier === opt.carrier;
                      return (
                        <button
                          key={opt.carrier}
                          type="button"
                          onClick={() => setSelShip(opt)}
                          className={`flex items-center gap-4 w-full px-4 py-4 text-left transition-colors focus:outline-none ${
                            selected ? 'bg-ink/[0.03]' : 'hover:bg-warm/50'
                          }`}
                        >
                          {/* Radio */}
                          <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${selected ? 'border-ink' : 'border-mist'}`}>
                            {selected && <span className="w-2 h-2 rounded-full bg-ink block" />}
                          </span>

                          {/* Carrier icon */}
                          <span className="shrink-0 text-mid">
                            <CarrierIcon carrier={opt.carrier} />
                          </span>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-ink">{opt.label}</span>
                              {opt.tag && (
                                <span className={`text-[10px] font-bold tracking-[0.08em] uppercase px-2 py-0.5 ${TAG_COLOR[opt.tag]}`}>
                                  {TAG_LABEL[opt.tag]}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-faint mt-0.5">
                              {opt.estimatedDays === 0
                                ? 'Entrega hoje'
                                : opt.estimatedDays === 1
                                  ? 'Entrega em 1 dia útil'
                                  : `Entrega em até ${opt.estimatedDays} dias úteis`}
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
                ) : null}
                <FieldError msg={errors.shipping} />
              </div>
            </div>

            {/* ── Submit ── */}
            <div className="flex flex-col gap-4">
              <button
                type="submit"
                disabled={submitting || !selectedShipping}
                className="flex items-center justify-center gap-2.5 w-full h-14 bg-ink text-paper text-sm font-semibold tracking-[0.05em] hover:bg-clay disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 active:scale-[0.99]"
              >
                {submitting ? (
                  <><span className="spinner" />Gerando PIX…</>
                ) : selectedShipping ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="opacity-70"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                    Pagar {formatCurrency(total)} com PIX
                  </>
                ) : (
                  'Selecione a entrega para continuar'
                )}
              </button>

              <div className="flex items-center justify-center gap-5">
                {[
                  { text: 'Conexão segura SSL' },
                  { text: 'PIX confirmado instantaneamente' },
                  { text: 'Dados protegidos' },
                ].map(({ text }) => (
                  <span key={text} className="flex items-center gap-1.5 text-[10px] text-faint">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    {text}
                  </span>
                ))}
              </div>
            </div>

          </form>

          {/* ── Resumo sticky ── */}
          <div className="w-full lg:sticky lg:top-6">
            <div className="border border-mist">
              {/* Header */}
              <div className="px-5 py-4 border-b border-mist flex items-center justify-between">
                <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-faint">Seu pedido</h2>
                <span className="text-xs text-faint">{totalItems} {totalItems === 1 ? 'item' : 'itens'}</span>
              </div>

              {/* Itens */}
              <div className="px-5 py-4 flex flex-col gap-4">
                {items.map(item => (
                  <div key={item.sku} className="flex items-start gap-3">
                    <div className="relative shrink-0 w-12 h-14 bg-warm border border-mist/60 overflow-hidden">
                      {item.image
                        ? <Image src={item.image} alt={item.productName} fill sizes="48px" className="object-cover" />
                        : <div className="h-full flex items-center justify-center"><span className="font-display text-faint/30 text-xs">M</span></div>
                      }
                      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-ink text-paper text-[9px] font-bold flex items-center justify-center leading-none rounded-full">
                        {item.quantity}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-ink leading-snug line-clamp-2">{item.productName}</p>
                      {item.variant?.size && <p className="text-[11px] text-faint mt-0.5">{item.variant.size}</p>}
                    </div>
                    <span className="text-xs font-semibold text-ink shrink-0">{formatCurrency(item.unitPrice * item.quantity)}</span>
                  </div>
                ))}
              </div>

              {/* Totais */}
              <div className="px-5 py-4 border-t border-mist flex flex-col gap-2.5">
                <div className="flex justify-between text-sm text-mid">
                  <span>Subtotal</span>
                  <span className="text-ink">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-faint">Frete</span>
                  {shippingLoading ? (
                    <span className="text-faint text-xs animate-pulse">calculando…</span>
                  ) : selectedShipping ? (
                    <span className={selectedShipping.priceCents === 0 ? 'text-emerald-600 font-semibold text-xs' : 'text-ink text-sm'}>
                      {selectedShipping.priceCents === 0 ? 'Grátis' : formatCurrency(selectedShipping.priceCents)}
                    </span>
                  ) : (
                    <span className="text-faint text-xs">a calcular</span>
                  )}
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
                <span className="font-display text-2xl text-ink">{formatCurrency(total)}</span>
              </div>

              {/* Trust */}
              <div className="px-5 pb-5 border-t border-mist pt-4 flex flex-col gap-2">
                {[
                  'Pagamento 100% seguro via PIX',
                  'Confirmação automática em segundos',
                  'Nota fiscal emitida no pedido',
                ].map(text => (
                  <div key={text} className="flex items-center gap-2 text-xs text-faint">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
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

// ── Sub-components ──────────────────────────────────────────────────────────

function Label({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-mid mb-1.5 tracking-[0.04em]">
      {children}
      {optional && <span className="ml-1.5 text-faint font-normal normal-case tracking-normal">opcional</span>}
    </label>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>{msg}</p>;
}

function BlockHeader({ num, label }: { num: number; label: string }) {
  return (
    <div className="flex items-center gap-4 pb-4 border-b border-mist">
      <span className="w-7 h-7 bg-ink text-paper text-xs font-bold flex items-center justify-center shrink-0 rounded-sm">
        {num}
      </span>
      <h2 className="font-display font-normal text-ink text-xl">{label}</h2>
    </div>
  );
}

function StepLine({ done }: { done?: boolean }) {
  return <div className={`flex-1 h-px max-w-[3rem] ${done ? 'bg-ink/25' : 'bg-mist'}`} />;
}

function Step({ state, label, num }: { state: 'done' | 'active' | 'pending'; label: string; num: number }) {
  return (
    <div className={`flex items-center gap-2 shrink-0 ${state === 'pending' ? 'opacity-40' : ''}`}>
      <span className={`w-6 h-6 flex items-center justify-center text-[10px] font-bold rounded-sm shrink-0 transition-colors ${
        state === 'done'   ? 'bg-ink/10 text-ink' :
        state === 'active' ? 'bg-ink text-paper' :
                             'border border-mist text-faint'
      }`}>
        {state === 'done'
          ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          : num
        }
      </span>
      <span className={`text-xs font-semibold hidden sm:block ${state === 'active' ? 'text-ink' : 'text-faint'}`}>
        {label}
      </span>
    </div>
  );
}
