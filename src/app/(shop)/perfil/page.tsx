'use client';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { db, auth } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { setReturnTo } from '@/lib/auth/returnTo';
import { PerfilSkeleton } from '@/components/ui/Skeleton';

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

  // O nome chega depois do primeiro render (userData carrega à parte):
  // antes o campo nascia vazio e ficava vazio.
  useEffect(() => {
    if (!nameTouched) setName(userData?.name ?? user?.displayName ?? '');
  }, [userData?.name, user?.displayName, nameTouched]);

  useEffect(() => {
    if (!loading && !user) { setReturnTo('/perfil'); router.push('/entrar'); }
  }, [loading, user, router]);

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
    setError('');
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

  return (
    <div>
      <div className="border-b border-mist">
        <div className="container-shop py-8 sm:py-10">
          <Link href="/conta" className="group inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.22em] uppercase text-faint hover:text-ink transition-colors duration-150 mb-3">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>
            Área do cliente
          </Link>
          <h1 className="font-display font-normal text-ink text-4xl sm:text-5xl">
            Meu perfil
          </h1>
        </div>
      </div>

      <div className="container-shop py-12 max-w-lg">
        {/* Dados pessoais */}
        <div className="border border-mist p-6 mb-4">
          <h2 className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint mb-5">Dados pessoais</h2>
          <div className="flex flex-col gap-4">
            <div>
              <label htmlFor="perfil-nome" className="label">Nome</label>
              <input id="perfil-nome" value={name} onChange={e => { setNameTouched(true); setName(e.target.value); }} autoComplete="name" className="input" />
            </div>
            <div>
              <label htmlFor="perfil-email" className="label">E-mail</label>
              <input id="perfil-email" value={user.email ?? ''} disabled className="input opacity-40 cursor-not-allowed bg-warm" />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? 'Salvando…' : 'Salvar alterações'}
              </button>
              {saved && (
                <span className="text-[12px] text-green-600 font-semibold flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  Salvo!
                </span>
              )}
            </div>
          </div>
        </div>

        {error && (
          <p role="alert" className="mb-4 border border-red-200 bg-red-50 text-red-700 text-[13px] px-4 py-3">{error}</p>
        )}

        {/* LGPD */}
        <div className="border border-mist p-6 mb-4">
          <h2 className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint mb-2">Privacidade e dados (LGPD)</h2>
          <p className="text-[13px] text-mid mb-5 leading-relaxed">
            Você tem direito de exportar todos os seus dados ou solicitar a exclusão completa da sua conta.
          </p>
          <div className="flex gap-3 flex-wrap">
            <button onClick={handleExport} className="btn-outline text-[13px]">
              Exportar meus dados
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="border border-red-200 text-red-600 px-4 py-2 text-[13px] font-medium hover:bg-red-50 transition-colors"
            >
              Excluir conta
            </button>
          </div>
        </div>

        {/* Confirmação de exclusão */}
        {confirmDelete && (
          <div className="border border-red-200 bg-red-50 p-5 mb-4">
            <p className="text-[13px] font-semibold text-red-800 mb-1">Tem certeza?</p>
            <p className="text-[12px] text-red-600 mb-4 leading-relaxed">
              Esta ação é irreversível. Todos os seus dados serão removidos permanentemente.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="bg-red-600 text-white px-4 py-2.5 text-[13px] font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Excluindo…' : 'Sim, excluir minha conta'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="btn-outline text-[13px]"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        <button onClick={logout} className="text-[13px] text-faint hover:text-clay transition-colors font-medium flex items-center gap-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sair da conta
        </button>
      </div>
    </div>
  );
}
