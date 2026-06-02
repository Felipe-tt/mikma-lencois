'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { deleteUser } from 'firebase/auth';
import { db, auth } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';

export default function PerfilPage() {
  const { user, userData, logout } = useAuth();
  const router = useRouter();
  const [name, setName] = useState(userData?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!user) {
    router.push('/login');
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
    const res = await fetch('/api/user/export', { method: 'GET', headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
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
      await fetch('/api/user/delete', { method: 'DELETE', headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      await deleteUser(auth.currentUser!);
      router.push('/');
    } catch {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-lg mx-auto px-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">Minha conta</h1>

        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Dados pessoais</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Nome</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">E-mail</label>
              <input
                value={user.email ?? ''}
                disabled
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
              {saved && <span className="text-sm text-green-600">✓ Salvo!</span>}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Privacidade e dados (LGPD)</h2>
          <p className="text-xs text-gray-500 mb-4">
            Você tem direito de exportar todos os seus dados ou solicitar a exclusão completa da sua conta.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleExport}
              className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Exportar meus dados
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="border border-red-200 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
            >
              Excluir conta
            </button>
          </div>
        </div>

        {confirmDelete && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-6">
            <p className="text-sm font-medium text-red-800 mb-1">Tem certeza?</p>
            <p className="text-xs text-red-600 mb-4">Esta ação é irreversível. Todos os seus dados serão removidos permanentemente.</p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Excluindo...' : 'Sim, excluir minha conta'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        <button
          onClick={logout}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          Sair da conta
        </button>
      </div>
    </div>
  );
}
