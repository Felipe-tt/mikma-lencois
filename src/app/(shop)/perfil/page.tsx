'use client';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteField, doc, getDoc, updateDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { db, auth } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { setReturnTo } from '@/lib/auth/returnTo';
import { PerfilSkeleton } from '@/components/ui/Skeleton';
import { getRecaptchaToken } from '@/lib/recaptcha-client';
import type { Address } from '@/types';

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
  const [phone, setPhone] = useState('');
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
    if (!loading && !user) { setReturnTo('/perfil'); router.push('/entrar'); }
  }, [loading, user, router]);

  // Endereço e telefone que o checkout salvou no perfil.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getDoc(doc(db, 'users', user.uid))
      .then(snap => {
        if (cancelled) return;
        const d = snap.data();
        setAddress((d?.address as Address | undefined) ?? null);
        setPhone(typeof d?.phone === 'string' ? d.phone : '');
      })
      .catch(() => { if (!cancelled) setAddress(null); });
    return () => { cancelled = true; };
  }, [user]);

  if (loading || !user) return <PerfilSkeleton />;

  const handleSave = async () => {
    const clean = name.trim();
    if (!clean) { setError('Digite seu nome.'); return; }
    setSaving(true); setError('');
    try {
      await updateDoc(doc(db, 'users', user.uid), { name: clean });
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
      setError(err instanceof Error && err.message ? err.message : 'Não foi possível excluir a conta agora.');
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
  const dirty = name.trim() !== (userData?.name ?? user.displayName ?? '').trim();

  return (
    <div>
      <div className="border-b border-mist bg-warm/60">
        <div className="container-shop py-8 sm:py-12">
          <Link href="/conta" className="group inline-flex items-center gap-1.5 text-[12px] font-medium text-mid hover:text-ink transition-colors duration-150 mb-5">
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
                <input id="perfil-nome" value={name} onChange={e => { setNameTouched(true); setName(e.target.value); setSaved(false); }} autoComplete="name" className="input" />
              </div>
              <div>
                <label htmlFor="perfil-email" className="label">E-mail</label>
                <div className="relative">
                  <input id="perfil-email" value={user.email ?? ''} readOnly aria-describedby="perfil-email-dica" className="input !bg-warm/60 text-mid pr-10 cursor-default" />
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" className="absolute right-4 top-1/2 -translate-y-1/2 text-faint"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                </div>
                <p id="perfil-email-dica" className="text-[11.5px] text-faint mt-1.5">É o e-mail de login, não dá pra trocar por aqui.</p>
              </div>
              <div className="flex items-center gap-3 pt-1 min-h-[44px]">
                <button onClick={handleSave} disabled={saving || !dirty} className="btn-primary">
                  {saving ? <><span className="spinner w-3.5 h-3.5" /> Salvando…</> : 'Salvar alterações'}
                </button>
                {saved && (
                  <span role="status" className="text-[12.5px] text-emerald-700 font-medium flex items-center gap-1.5 animate-fade-in">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Salvo
                  </span>
                )}
              </div>
            </div>
          </Card>

          {/* ── Endereço salvo ── */}
          <Card title="Endereço de entrega" desc="Preenchido no seu último pedido e sugerido no próximo checkout.">
            {address === undefined ? (
              <div className="flex flex-col gap-2"><span className="skeleton h-4 w-3/4" /><span className="skeleton h-4 w-1/2" /><span className="skeleton h-4 w-1/3" /></div>
            ) : address ? (
              <div className="flex flex-col gap-5">
                <div className="flex items-start gap-3.5 rounded-2xl bg-warm/60 px-4 py-4">
                  <span aria-hidden="true" className="w-9 h-9 rounded-full bg-clay/10 text-clay flex items-center justify-center shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  </span>
                  <address className="not-italic text-[13.5px] text-ink leading-relaxed min-w-0">
                    {address.street}, {address.number}{address.complement ? ` · ${address.complement}` : ''}<br />
                    <span className="text-mid">{address.neighborhood} · {address.city}/{address.state}</span><br />
                    <span className="text-mid">CEP {address.cep.replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2')}</span>
                    {phone && <><br /><span className="text-mid">Tel. {phone}</span></>}
                  </address>
                </div>
                <button onClick={handleRemoveAddress} disabled={removingAddress} className="self-start text-[13px] font-medium text-mid hover:text-red-600 transition-colors disabled:opacity-50">
                  {removingAddress ? 'Removendo…' : 'Remover endereço salvo'}
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-mist-d px-5 py-6 text-center">
                <p className="text-[13.5px] text-ink font-medium">Nenhum endereço salvo</p>
                <p className="text-[12.5px] text-mid mt-1">Ele fica salvo aqui depois da sua primeira compra.</p>
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
                <button onClick={() => setConfirmDelete(true)} className="text-[13px] font-medium text-red-600 hover:text-red-700 transition-colors">
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
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
