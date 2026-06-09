'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc } from 'firebase/firestore';
import { deleteUser } from 'firebase/auth';
import { db, auth } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { PerfilSkeleton } from '@/components/ui/Skeleton';

export default function PerfilPage() {
  const { user, userData, loading, logout } = useAuth();
  const router = useRouter();
  const [name, setName] = useState(userData?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (loading) return <PerfilSkeleton />;

  if (!user) {
    router.push('/entrar');
    return null;
  }

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await updateDoc(doc(db, 'users', user.uid), { name });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleExport = async () => {
    const res = await fetch('/api/user/export', {
      headers: { Authorization: `Bearer ${await user.getIdToken()}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'meus-dados.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch('/api/user/delete', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      await deleteUser(auth.currentUser!);
      router.push('/');
    } catch {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="container-shop">
          <span className="eyebrow mb-3 block">Conta</span>
          <h1 className="font-display font-normal text-ink" >
            Minha conta
          </h1>
        </div>
      </div>

      <div className="container-shop py-12 max-w-lg">
        {/* Dados pessoais */}
        <div className="border border-mist bg-paper p-6 mb-5">
          <h2 className="text-xs font-bold tracking-[0.15em] uppercase text-faint mb-5">Dados pessoais</h2>
          <div className="flex flex-col gap-4">
            <div>
              <label className="label">Nome</label>
              <input value={name} onChange={e => setName(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">E-mail</label>
              <input value={user.email ?? ''} disabled className="input opacity-50 cursor-not-allowed" />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              {saved && <span className="text-sm text-green-600 font-medium">✓ Salvo!</span>}
            </div>
          </div>
        </div>

        {/* LGPD */}
        <div className="border border-mist bg-paper p-6 mb-5">
          <h2 className="text-xs font-bold tracking-[0.15em] uppercase text-faint mb-2">Privacidade e dados (LGPD)</h2>
          <p className="text-xs text-mid mb-5 leading-relaxed">
            Você tem direito de exportar todos os seus dados ou solicitar a exclusão completa da sua conta.
          </p>
          <div className="flex gap-3 flex-wrap">
            <button onClick={handleExport} className="btn-outline text-sm">
              Exportar meus dados
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="border border-red-200 text-red-600 px-4 py-2 text-sm font-medium hover:bg-red-50 transition-colors"
            >
              Excluir conta
            </button>
          </div>
        </div>

        {/* Confirmação de exclusão */}
        {confirmDelete && (
          <div className="border border-red-200 bg-red-50 p-5 mb-5">
            <p className="text-sm font-semibold text-red-800 mb-1">Tem certeza?</p>
            <p className="text-xs text-red-600 mb-4 leading-relaxed">
              Esta ação é irreversível. Todos os seus dados serão removidos permanentemente.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Excluindo…' : 'Sim, excluir minha conta'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="btn-outline text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        <button onClick={logout} className="text-sm text-faint hover:text-clay transition-colors font-medium">
          Sair da conta
        </button>
      </div>
    </div>
  );
}
