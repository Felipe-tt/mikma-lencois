'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { setReturnTo } from '@/lib/auth/returnTo';

/**
 * Login com senha que não passou pela checagem do site (ver
 * lib/auth/loginTicket.ts): endereço, pedidos, CPF e a conta ficam
 * fechados. Em vez de telas vazias, um aviso claro para entrar de novo, e a
 * pessoa volta para onde estava.
 */
export function LoginCheckBanner() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!user?.needsRelogin) return null;

  async function relogin() {
    setBusy(true);
    setReturnTo(window.location.pathname + window.location.search);
    await logout().catch(() => {});
    router.push('/entrar');
  }

  return (
    <div role="status" className="bg-warm border-b border-mist">
      <div className="container-shop py-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-[13px] text-ink">
          Por segurança, entre de novo na sua conta para ver seus pedidos e dados.
        </p>
        <button
          onClick={relogin}
          disabled={busy}
          className="h-9 px-4 inline-flex items-center rounded-full bg-ink text-paper text-[12.5px] font-medium hover:bg-clay transition-colors disabled:opacity-60"
        >
          Entrar de novo
        </button>
      </div>
    </div>
  );
}
