'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';

export function PainelGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push('/entrar'); return; }
    if (user.role !== 'seller' && user.role !== 'admin') router.push('/');
  }, [user, loading, router]);

  if (loading || !user || (user.role !== 'seller' && user.role !== 'admin')) {
    return <div className="flex min-h-screen items-center justify-center"><p className="text-sm text-gray-400">Verificando acesso…</p></div>;
  }

  return <>{children}</>;
}
