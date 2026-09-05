'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { BrandLogo } from '@/components/BrandLogo';
import { IconAlert } from '@/components/ui/Icon';

function ConfirmContent() {
  const params = useSearchParams();
  const email = params.get('email') ?? '';
  const token = params.get('token') ?? '';

  const [state, setState] = useState<'checking' | 'ok' | 'error'>('checking');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!email || !token) {
      setState('error');
      setError('Link incompleto. Faça login novamente.');
      return;
    }

    (async () => {
      try {
        const res = await fetch('/api/auth/login-confirm-challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, token }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        setState('ok');
      } catch (err: unknown) {
        setState('error');
        setError(err instanceof Error ? err.message : 'Não foi possível confirmar o login.');
      }
    })();
  }, [email, token]);

  return (
    <div className="w-full max-w-[420px] mx-auto text-center py-10">
      <Link href="/" className="flex justify-center mb-10">
        <BrandLogo alt="Mikma" className="h-9 w-auto object-contain" />
      </Link>

      {state === 'checking' && (
        <>
          <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center">
            <span className="spinner-dark" />
          </div>
          <h1 className="font-display font-normal text-ink text-2xl mb-2">Confirmando seu login…</h1>
          <p className="text-mid text-sm">Só um instante.</p>
        </>
      )}

      {state === 'ok' && (
        <>
          <div className="w-20 h-20 bg-green-50 border border-green-100 flex items-center justify-center mx-auto mb-6">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-green-500">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h1 className="font-display font-normal text-ink text-2xl mb-2">Login confirmado!</h1>
          <p className="text-mid text-sm">
            Pode fechar esta aba e voltar para a tela onde você digitou sua senha —
            ela vai continuar sozinha em alguns segundos.
          </p>
        </>
      )}

      {state === 'error' && (
        <>
          <div className="w-20 h-20 bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-6">
            <IconAlert size={40} strokeWidth={1.5} className="text-red-500" />
          </div>
          <h1 className="font-display font-normal text-ink text-2xl mb-2">Não foi possível confirmar</h1>
          <p className="text-mid text-sm mb-6">{error}</p>
          <Link href="/entrar" className="btn-primary inline-flex h-12 px-8 items-center justify-center text-[13px] font-semibold">
            Voltar para o login
          </Link>
        </>
      )}
    </div>
  );
}

export default function ConfirmarLoginPage() {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-6">
      <Suspense fallback={<div className="spinner-dark mx-auto" />}>
        <ConfirmContent />
      </Suspense>
    </div>
  );
}
