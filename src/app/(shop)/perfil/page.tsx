'use client';
import { userMessage } from '@/lib/userMessage';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { db, auth } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { setReturnTo } from '@/lib/auth/returnTo';
import { PerfilSkeleton } from '@/components/ui/Skeleton';
import { getRecaptchaToken } from '@/lib/recaptcha-client';
import type { Address } from '@/types';
import { Select } from '@/components/ui/Select';
import { EMPTY_ADDRESS, toAddress, streetLine } from '@/lib/address';
import { maskCep, maskCpf, maskPhone, onlyDigits, isValidCep, isValidPhone, BR_STATES } from '@/lib/masks';

export default function PerfilPage() {
  const { user, userData, loading, logout } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [address, setAddress] = useState<Address | null | undefined>(undefined);
  // Celular editável (o checkout usa para preencher o pedido). O CPF só
  // aparece, parcialmente oculto: não se troca pelo perfil.
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');
  const [savedPhone, setSavedPhone] = useState('');
  const [savedName, setSavedName] = useState<string | null>(null);
  const phoneTouched = useRef(false);
  const [addrStatus, setAddrStatus] = useState('');
  const editAddrBtn = useRef<HTMLButtonElement>(null);
  const [phoneErr, setPhoneErr] = useState('');
  const [editingAddress, setEditingAddress] = useState(false);
  const [removingAddress, setRemovingAddress] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [exporting, setExporting] = useState(false);

  // O nome chega depois do primeiro render (userData carrega à parte):
  // antes o campo nascia vazio e ficava vazio.
  useEffect(() => {
    if (!nameTouched) setName(userData?.name ?? user?.displayName ?? '');
  }, [userData?.name, user?.displayName, nameTouched]);

  useEffect(() => {
    if (!loading && !user) { setReturnTo('/perfil'); router.replace('/entrar'); }
  }, [loading, user, router]);

  // Endereço e telefone que o checkout salvou no perfil.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getDoc(doc(db, 'users', user.uid))
      .then(snap => {
        if (cancelled) return;
        const d = snap.data();
        setAddress(toAddress(d?.address));
        const ph = typeof d?.phone === 'string' ? maskPhone(d.phone) : '';
        const cp = typeof d?.cpf === 'string' ? maskCpf(d.cpf) : '';
        // Não apaga o que a pessoa já começou a digitar (rede lenta).
        if (!phoneTouched.current) setPhone(ph);
        setSavedPhone(ph);
        setCpf(cp);
      })
      .catch(() => { if (!cancelled) setAddress(null); });
    return () => { cancelled = true; };
  }, [user]);

  if (loading || !user) return <PerfilSkeleton />;

  const handleSave = async () => {
    const clean = name.trim();
    if (!clean) { setError('Digite seu nome.'); return; }
    // Mesmas regras do Firestore: sem isso a gravação era recusada e a
    // mensagem falava em conexão.
    if (clean.length > 100 || /[<>]/.test(clean)) { setError('O nome pode ter até 100 caracteres, sem < ou >.'); return; }
    if (phone && !isValidPhone(phone)) { setPhoneErr('Informe o celular com DDD'); return; }
    setPhoneErr('');
    setSaving(true); setError('');
    try {
      await setDoc(doc(db, 'users', user.uid), { name: clean, phone: onlyDigits(phone) }, { merge: true });
      setSavedPhone(phone);
      setSavedName(clean);
      // Atualiza também o nome do login, que é o que aparece em "Olá, X".
      if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: clean }).catch(() => {});
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Não foi possível salvar. Verifique sua conexão e tente de novo.');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setError(''); setExporting(true);
    try {
      const res = await fetch('/api/user/export', {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'meus-dados.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Não foi possível exportar seus dados agora. Tente de novo em alguns minutos.');
    } finally {
      setExporting(false);
    }
  };

  // A API já apaga a conta no Firebase Auth. Antes o navegador tentava
  // apagar de novo (dava erro e a pessoa ficava na página sem aviso), e
  // se a API falhasse o login era apagado mesmo assim, deixando os dados.
  const handleDelete = async () => {
    setDeleting(true); setError('');
    try {
      const res = await fetch('/api/user/delete', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Não foi possível excluir a conta agora. Tente de novo em alguns minutos.');
      }
      await logout().catch(() => {});
      router.push('/');
    } catch (err) {
      setError(userMessage(err, 'Não foi possível excluir a conta agora.'));
      setDeleting(false);
    }
  };

  const handleRemoveAddress = async () => {
    setRemovingAddress(true); setError('');
    try {
      await updateDoc(doc(db, 'users', user.uid), { address: deleteField() });
      setAddress(null);
    } catch {
      setError('Não foi possível remover o endereço agora. Tente de novo.');
    } finally {
      setRemovingAddress(false);
    }
  };

  // Mesmo fluxo do "esqueci minha senha": manda o link pro e-mail da conta.
  const handleSendReset = async () => {
    if (!user.email) return;
    setSendingReset(true); setError('');
    try {
      const recaptchaToken = await getRecaptchaToken('send_reset');
      await fetch('/api/auth/send-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email.toLowerCase(), recaptchaToken }),
      });
      setResetSent(true);
    } catch {
      setError('Não foi possível enviar o link agora. Tente de novo em alguns minutos.');
    } finally {
      setSendingReset(false);
    }
  };

  const providers = auth.currentUser?.providerData.map(p => p.providerId) ?? [];
  const usesPassword = providers.includes('password');
  const usesGoogle = providers.includes('google.com');
  const initial = (name || user.email || '?').trim().charAt(0).toUpperCase();
  const dirty = name.trim() !== (savedName ?? userData?.name ?? user.displayName ?? '').trim() || phone !== savedPhone;

  return (
    <div>
      <div className="border-b border-mist bg-warm/60">
        <div className="container-shop py-8 sm:py-12">
          <Link href="/conta" className="group relative before:absolute before:-inset-y-3 before:inset-x-0 before:content-[''] inline-flex items-center gap-1.5 text-[12px] font-medium text-mid hover:text-ink transition-colors duration-150 mb-5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>
            Área do cliente
          </Link>
          <div className="flex items-center gap-5">
            <span aria-hidden="true" className="w-16 h-16 shrink-0 rounded-full bg-clay text-paper font-display text-[1.8rem] flex items-center justify-center ring-4 ring-paper shadow-[0_12px_28px_-14px_rgba(180,87,68,0.7)]">
              {initial}
            </span>
            <div className="min-w-0">
              <h1 className="font-display font-normal text-ink text-[2.2rem] sm:text-5xl leading-[1.05] tracking-[-0.015em]">Meus dados</h1>
              <p className="text-[13px] text-mid mt-1.5 truncate">{user.email}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container-shop py-8 sm:py-12 pb-20">
        {error && (
          <p role="alert" className="mb-6 rounded-2xl border border-red-200 bg-red-50 text-red-700 text-[13px] px-5 py-3.5 animate-fade-in">{error}</p>
        )}

        <div className="grid lg:grid-cols-2 gap-4 sm:gap-5 items-start">
          {/* ── Dados pessoais ── */}
          <Card title="Dados pessoais" desc="Como a gente te chama nos pedidos e e-mails.">
            <div className="flex flex-col gap-4">
              <div>
                <label htmlFor="perfil-nome" className="label">Nome completo</label>
                <input id="perfil-nome" maxLength={100} value={name} onChange={e => { setNameTouched(true); setName(e.target.value); setSaved(false); }} autoComplete="name" className="input" />
              </div>
              <div>
                <label htmlFor="perfil-email" className="label">E-mail</label>
                <div className="relative">
                  <input id="perfil-email" value={user.email ?? ''} readOnly aria-describedby="perfil-email-dica" className="input !bg-warm/60 text-mid pr-10 cursor-default" />
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" className="absolute right-4 top-1/2 -translate-y-1/2 text-faint"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                </div>
                <p id="perfil-email-dica" className="text-[11.5px] text-faint mt-1.5">É o e-mail de login, não dá pra trocar por aqui.</p>
              </div>
              <div>
                <label htmlFor="perfil-phone" className="label">Celular / WhatsApp</label>
                <input id="perfil-phone" value={phone} onChange={e => { phoneTouched.current = true; setPhone(maskPhone(e.target.value)); setSaved(false); setPhoneErr(''); }}
                  type="tel" maxLength={15} placeholder="(47) 99999-0000" autoComplete="tel"
                  aria-invalid={!!phoneErr} aria-describedby={phoneErr ? 'perfil-phone-err' : 'perfil-phone-dica'}
                  className={`input ${phoneErr ? '!border-red-400' : ''}`} />
                {phoneErr
                  ? <p id="perfil-phone-err" className="text-[11.5px] text-red-600 mt-1.5">{phoneErr}</p>
                  : <p id="perfil-phone-dica" className="text-[11.5px] text-faint mt-1.5">Para avisos da entrega. Já vem preenchido no checkout.</p>}
              </div>
              {cpf && (
                <div>
                  <span className="label">CPF</span>
                  <p className="input !bg-warm/60 text-mid flex items-center justify-between cursor-default tabular-nums">
                    {/* Só os dígitos do meio, como em nota fiscal. */}
                    {`***.${cpf.slice(4, 7)}.${cpf.slice(8, 11)}-**`}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" className="text-faint shrink-0"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                  </p>
                  <p className="text-[11.5px] text-faint mt-1.5">Para corrigir o CPF, fale com a gente.</p>
                </div>
              )}
              <div className="flex items-center gap-3 pt-1 min-h-[44px]">
                <button onClick={handleSave} disabled={saving || !dirty} className="btn-primary">
                  {saving ? <><span className="spinner w-3.5 h-3.5" /> Salvando…</> : 'Salvar alterações'}
                </button>
                {saved && (
                  <span role="status" className="text-[12.5px] text-emerald-700 font-medium flex items-center gap-1.5 animate-fade-in">
                    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Salvo
                  </span>
                )}
              </div>
            </div>
          </Card>

          {/* ── Endereço salvo ── */}
          <Card title="Endereço de entrega" desc="Sugerido no próximo checkout. Pode trocar quando quiser.">
            {address === undefined ? (
              <div className="flex flex-col gap-2"><span className="skeleton h-4 w-3/4" /><span className="skeleton h-4 w-1/2" /><span className="skeleton h-4 w-1/3" /></div>
            ) : editingAddress ? (
              <AddressForm
                initial={address ?? EMPTY_ADDRESS}
                onCancel={() => { setEditingAddress(false); requestAnimationFrame(() => editAddrBtn.current?.focus()); }}
                onSave={async next => {
                  await setDoc(doc(db, 'users', user.uid), { address: next }, { merge: true });
                  setAddress(next);
                  setEditingAddress(false);
                  setAddrStatus('Endereço salvo');
                  setTimeout(() => setAddrStatus(''), 2500);
                  // O formulário some: o foco volta para o botão de editar.
                  requestAnimationFrame(() => editAddrBtn.current?.focus());
                }}
              />
            ) : address ? (
              <div className="flex flex-col gap-5">
                <div className="flex items-start gap-3.5 rounded-2xl bg-warm/60 px-4 py-4">
                  <span aria-hidden="true" className="w-9 h-9 rounded-full bg-clay/10 text-clay flex items-center justify-center shrink-0">
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  </span>
                  <address className="not-italic text-[13.5px] text-ink leading-relaxed min-w-0">
                    {streetLine(address)}{address.complement ? ` · ${address.complement}` : ''}<br />
                    <span className="text-mid">{[address.neighborhood, [address.city, address.state].filter(Boolean).join('/')].filter(Boolean).join(' · ')}</span>
                    {address.cep && <><br /><span className="text-mid">CEP {maskCep(address.cep)}</span></>}
                  </address>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <button ref={editAddrBtn} onClick={() => setEditingAddress(true)} className="btn-outline">
                    Editar endereço
                  </button>
                  <button onClick={handleRemoveAddress} disabled={removingAddress} className="py-3 -my-3 text-[13px] font-medium text-mid hover:text-red-600 transition-colors disabled:opacity-50">
                    {removingAddress ? 'Removendo…' : 'Remover'}
                  </button>
                  {addrStatus && (
                    <span role="status" className="text-[12.5px] text-emerald-700 font-medium flex items-center gap-1.5 animate-fade-in">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                      {addrStatus}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-mist-d px-5 py-6 text-center">
                <p className="text-[13.5px] text-ink font-medium">Nenhum endereço salvo</p>
                <p className="text-[12.5px] text-mid mt-1 mb-4">Salve agora e o checkout já vem preenchido.</p>
                <button ref={editAddrBtn} onClick={() => setEditingAddress(true)} className="btn-outline">
                  Adicionar endereço
                </button>
              </div>
            )}
          </Card>

          {/* ── Acesso e segurança ── */}
          <Card title="Acesso e segurança" desc="Como você entra na sua conta.">
            <ul className="flex flex-col gap-2.5 mb-5">
              {usesPassword && <AccessRow label="E-mail e senha" />}
              {usesGoogle && <AccessRow label="Conta Google" />}
            </ul>
            {usesPassword ? (
              resetSent ? (
                <p role="status" className="rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[13px] px-4 py-3 leading-relaxed animate-fade-in">
                  Enviamos um link pra <strong className="font-semibold">{user.email}</strong>. Abra no mesmo aparelho pra criar a nova senha.
                </p>
              ) : (
                <button onClick={handleSendReset} disabled={sendingReset} className="btn-outline">
                  {sendingReset ? <><span className="spinner-dark w-3.5 h-3.5" /> Enviando…</> : 'Alterar minha senha'}
                </button>
              )
            ) : (
              <p className="text-[13px] text-mid leading-relaxed">Sua senha é a da sua conta Google. Pra trocar, use as configurações do Google.</p>
            )}
          </Card>

          {/* ── Privacidade ── */}
          <Card title="Privacidade e dados" desc="Seus direitos pela LGPD: baixar tudo que temos sobre você ou apagar a conta.">
            <div className="flex flex-wrap gap-3">
              <button onClick={handleExport} disabled={exporting} className="btn-outline">
                {exporting ? <><span className="spinner-dark w-3.5 h-3.5" /> Preparando…</> : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Baixar meus dados
                  </>
                )}
              </button>
            </div>

            <div className="mt-6 pt-5 border-t border-mist">
              {!confirmDelete ? (
                <button onClick={() => setConfirmDelete(true)} className="py-3 -my-3 text-[13px] font-medium text-red-700 hover:text-red-800 transition-colors">
                  Excluir minha conta…
                </button>
              ) : (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-5 animate-fade-in">
                  <p className="text-[13.5px] font-semibold text-red-800 mb-1">Excluir a conta de vez?</p>
                  <p className="text-[12.5px] text-red-700/90 mb-4 leading-relaxed">
                    Seus dados, favoritos e endereço são apagados e não dá pra desfazer. Pedidos já feitos ficam guardados só pelo tempo que a lei exige.
                  </p>
                  <div className="flex flex-wrap gap-2.5">
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="rounded-full bg-red-600 text-white px-5 py-2.5 text-[13px] font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      {deleting ? 'Excluindo…' : 'Sim, excluir'}
                    </button>
                    <button onClick={() => setConfirmDelete(false)} className="btn-ghost">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        <button onClick={logout} className="mt-8 inline-flex items-center gap-2 h-10 px-4 -ml-4 rounded-full text-[13px] text-mid hover:text-ink hover:bg-warm transition-colors">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sair da conta
        </button>
      </div>
    </div>
  );
}

function Card({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-mist bg-paper p-6 sm:p-7">
      <h2 className="font-display font-normal text-ink text-[1.35rem] leading-tight">{title}</h2>
      <p className="text-[13px] text-mid mt-1 mb-5 leading-relaxed">{desc}</p>
      {children}
    </section>
  );
}

function AccessRow({ label }: { label: string }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-mist px-4 py-3">
      <span className="text-[13.5px] text-ink">{label}</span>
      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-emerald-700">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
        Ativo
      </span>
    </li>
  );
}

type AddrKey = 'cep' | 'street' | 'number' | 'neighborhood' | 'city' | 'state';

// Mesmos campos e validação do endereço do checkout, com a busca do CEP.
function AddressForm({ initial, onSave, onCancel }: { initial: Address; onSave: (a: Address) => Promise<void>; onCancel: () => void }) {
  const [addr, setAddr] = useState<Address>({ ...initial, cep: maskCep(initial.cep) });
  const [errors, setErrors] = useState<Partial<Record<AddrKey, string>>>({});
  const [cepLoading, setCepLoading] = useState(false);
  const [cepMsg, setCepMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const set = (k: keyof Address, v: string) => {
    setAddr(a => ({ ...a, [k]: v }));
    setErrors(e => ({ ...e, [k]: undefined }));
  };

  // Só a resposta do último CEP digitado vale: corrigir o CEP rápido não
  // deixa a resposta atrasada do anterior sobrescrever o endereço.
  const lastCep = useRef('');
  async function lookupCep(masked: string) {
    const c = onlyDigits(masked);
    if (c.length !== 8) return;
    lastCep.current = c;
    setCepLoading(true); setCepMsg('');
    try {
      const d = await (await fetch(`https://viacep.com.br/ws/${c}/json/`)).json();
      if (lastCep.current !== c) return;
      if (d.erro) { setCepMsg('CEP não encontrado. Confira ou preencha o endereço à mão.'); return; }
      // CEP de cidade inteira vem sem rua e bairro: limpa os antigos em vez
      // de manter a rua de outra cidade.
      setAddr(a => ({ ...a, street: d.logradouro ?? '', neighborhood: d.bairro ?? '', city: d.localidade || a.city, state: d.uf || a.state }));
      if (!d.logradouro) setCepMsg('Esse CEP é da cidade toda. Preencha a rua e o bairro.');
      setErrors({});
      // Rua veio do CEP: o próximo campo útil é o número.
      if (d.logradouro) document.getElementById('perfil-number')?.focus();
    } catch {
      if (lastCep.current === c) setCepMsg('Não deu para buscar o CEP agora. Preencha o endereço à mão.');
    } finally {
      if (lastCep.current === c) setCepLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Partial<Record<AddrKey, string>> = {};
    if (!isValidCep(addr.cep)) errs.cep = 'Confira o CEP (8 dígitos)';
    if (!addr.street.trim()) errs.street = 'Informe o logradouro';
    if (!addr.number.trim()) errs.number = 'Informe o número (ou S/N)';
    if (!addr.neighborhood.trim()) errs.neighborhood = 'Informe o bairro';
    if (!addr.city.trim()) errs.city = 'Informe a cidade';
    if (!addr.state) errs.state = 'Escolha o estado';
    setErrors(errs);
    const first = (Object.keys(errs) as AddrKey[])[0];
    if (first) { document.getElementById(`perfil-${first}`)?.focus(); return; }
    setSaving(true); setSaveError('');
    try {
      await onSave({
        cep: onlyDigits(addr.cep),
        street: addr.street.trim().slice(0, 120),
        number: addr.number.trim().slice(0, 20),
        complement: (addr.complement ?? '').trim().slice(0, 60),
        neighborhood: addr.neighborhood.trim().slice(0, 80),
        city: addr.city.trim().slice(0, 80),
        state: addr.state,
      });
    } catch {
      setSaveError('Não foi possível salvar o endereço. Verifique sua conexão e tente de novo.');
      setSaving(false);
    }
  }

  const field = (k: AddrKey | 'complement', label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => {
    const err = k !== 'complement' ? errors[k] : undefined;
    return (
      <div>
        <label htmlFor={`perfil-${k}`} className="label">{label}</label>
        <input id={`perfil-${k}`} value={addr[k] ?? ''} onChange={e => set(k, e.target.value)}
          aria-invalid={!!err} aria-describedby={err ? `perfil-${k}-err` : undefined}
          className={`input ${err ? '!border-red-400' : ''}`} {...props} />
        {err && <p id={`perfil-${k}-err`} className="text-[11.5px] text-red-600 mt-1.5">{err}</p>}
      </div>
    );
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 animate-fade-in">
      <div>
        <label htmlFor="perfil-cep" className="label">CEP</label>
        <div className="relative max-w-[12rem]">
          <input id="perfil-cep" value={addr.cep} autoFocus
            onChange={e => { const m = maskCep(e.target.value); set('cep', m); setCepMsg(''); if (onlyDigits(m).length === 8) lookupCep(m); }}
            inputMode="numeric" maxLength={9} placeholder="00000-000" autoComplete="postal-code"
            aria-invalid={!!errors.cep} aria-describedby={errors.cep ? 'perfil-cep-err' : cepMsg ? 'perfil-cep-msg' : undefined}
            className={`input ${errors.cep ? '!border-red-400' : ''}`} />
          {cepLoading && <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"><span className="spinner-dark w-3.5 h-3.5" /></span>}
        </div>
        {errors.cep && <p id="perfil-cep-err" className="text-[11.5px] text-red-600 mt-1.5">{errors.cep}</p>}
        {!errors.cep && cepMsg && <p id="perfil-cep-msg" role="status" className="text-[11.5px] text-mid mt-1.5">{cepMsg}</p>}
      </div>
      {field('street', 'Logradouro', { placeholder: 'Rua, Avenida, Travessa…', autoComplete: 'address-line1' })}
      <div className="grid grid-cols-2 gap-3">
        {field('number', 'Número', { placeholder: '123 ou S/N', autoComplete: 'off' })}
        {field('complement', 'Complemento', { placeholder: 'Opcional', autoComplete: 'address-line2' })}
      </div>
      {field('neighborhood', 'Bairro', { autoComplete: 'address-level3' })}
      <div className="grid grid-cols-[1fr_96px] gap-3">
        {field('city', 'Cidade', { autoComplete: 'address-level2' })}
        <div>
          <label htmlFor="perfil-state" className="label">UF</label>
          <Select
            triggerId="perfil-state"
            name="state"
            value={addr.state}
            onChange={v => set('state', v)}
            options={[{ value: '', label: '--' }, ...BR_STATES.map(uf => ({ value: uf, label: uf }))]}
            triggerClassName={`w-full border px-3 py-3 text-sm bg-white dark:bg-warm focus:outline-none focus:ring-2 transition-all flex items-center justify-between gap-2 rounded-xl cursor-pointer ${errors.state ? 'border-red-400 focus:ring-red-100' : 'border-mist hover:border-ink/20 focus:border-ink/40 focus:ring-ink/5'}`}
          />
          {errors.state && <p className="text-[11.5px] text-red-600 mt-1.5">{errors.state}</p>}
        </div>
      </div>
      {saveError && <p role="alert" className="text-[12.5px] text-red-600">{saveError}</p>}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? <><span className="spinner w-3.5 h-3.5" /> Salvando…</> : 'Salvar endereço'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className="btn-ghost">Cancelar</button>
      </div>
    </form>
  );
}
