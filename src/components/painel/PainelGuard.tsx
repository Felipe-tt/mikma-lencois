'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onIdTokenChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { PainelDashboardSkeleton } from '@/components/painel/PainelSkeleton';
import { StaffMfaGate } from '@/components/painel/StaffMfaGate';
import { hasSecondFactor, type MfaClaims } from '@/lib/staffMfa';

export function PainelGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  // A segunda etapa vale por sessão (está no token): acompanha a troca de
  // token, que acontece ao entrar com a passkey na tela obrigatória.
  const [secondFactor, setSecondFactor] = useState<boolean | null>(null);
  // A tela da passkey pede para ficar montada enquanto comemora a entrada.
  const [holdGate, setHoldGate] = useState(false);
  useEffect(() => onIdTokenChanged(auth, async u => {
    if (!u) { setSecondFactor(null); return; }
    const t = await u.getIdTokenResult();
    setSecondFactor(hasSecondFactor(t.claims as MfaClaims));
  }), []);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push('/entrar'); return; }
    if (user.role !== 'seller' && user.role !== 'admin') router.push('/');
  }, [user, loading, router]);

  // Comemorando a entrada com a passkey: a sessão troca por baixo (o token
  // novo passa por "loading"), mas a tela fica até a animação acabar.
  if (holdGate) return <StaffMfaGate onHold={setHoldGate} />;

  // onAuthStateChanged dispara loading=true não só na primeira carga, mas
  // toda vez que o Firebase revalida/reconecta a sessão (ex: voltar à aba
  // depois de alguns minutos parados), então essa tela aparece com
  // frequência, não só uma vez. Por isso usa o skeleton animado em vez de
  // texto estático: sem isso parece que o painel travou, quando na
  // verdade está só esperando o refresh do token.
  if (loading || !user || (user.role !== 'seller' && user.role !== 'admin') || secondFactor === null) {
    return (
      <div className="min-h-screen bg-warm p-5 sm:p-8">
        <div className="max-w-4xl mx-auto">
          <PainelDashboardSkeleton />
        </div>
      </div>
    );
  }

  if (!secondFactor) return <StaffMfaGate onHold={setHoldGate} />;

  return <>{children}</>;
}
