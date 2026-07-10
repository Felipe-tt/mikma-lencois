'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { PainelDashboardSkeleton } from '@/components/painel/PainelSkeleton';

export function PainelGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push('/entrar'); return; }
    if (user.role !== 'seller' && user.role !== 'admin') router.push('/');
  }, [user, loading, router]);

  // onAuthStateChanged dispara loading=true não só na primeira carga, mas
  // toda vez que o Firebase revalida/reconecta a sessão (ex: voltar à aba
  // depois de alguns minutos parados) — então essa tela aparece com
  // frequência, não só uma vez. Por isso usa o skeleton animado em vez de
  // texto estático: sem isso parece que o painel travou, quando na
  // verdade está só esperando o refresh do token.
  if (loading || !user || (user.role !== 'seller' && user.role !== 'admin')) {
    return (
      <div className="min-h-screen bg-warm p-5 sm:p-8">
        <div className="max-w-4xl mx-auto">
          <PainelDashboardSkeleton />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
