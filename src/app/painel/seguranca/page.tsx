'use client';
import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase/client';
import { PasskeyManager } from '@/components/auth/PasskeyManager';
import { TotpSetup } from '@/components/painel/TotpSetup';
import { hasSecondFactor, type MfaClaims } from '@/lib/staffMfa';

/** Segurança da conta da equipe: app autenticador (TOTP) e passkeys. */
export default function SegurancaPage() {
  const [sessionOk, setSessionOk] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    auth.currentUser?.getIdTokenResult().then(t => {
      if (alive) setSessionOk(hasSecondFactor(t.claims as MfaClaims));
    });
    return () => { alive = false; };
  }, []);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display font-normal text-ink text-2xl">Segurança da conta</h1>
        <p className="text-[13px] text-faint mt-1">
          Verificação em duas etapas: quem descobrir sua senha não entra no painel sem o seu celular.
        </p>
      </div>

      {sessionOk && (
        <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-[13px] text-emerald-800">
          Esta sessão entrou com verificação em duas etapas.
        </div>
      )}

      <TotpSetup />

      <section className="mt-5 rounded-2xl border border-mist bg-paper p-5 sm:p-6 [&>div]:mt-0 [&>div]:pt-0 [&>div]:border-t-0">
        <PasskeyManager />
      </section>
    </div>
  );
}
