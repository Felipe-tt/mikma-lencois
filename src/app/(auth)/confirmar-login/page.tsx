'use client';
import { userMessage } from '@/lib/userMessage';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { BrandLogo } from '@/components/BrandLogo';
import { IconAlert, IconShield } from '@/components/ui/Icon';

type Action = 'confirm' | 'deny';

/**
 * Página do link do e-mail de confirmação de login. Abrir o link não
 * confirma nada: antivírus de e-mail (comuns em e-mail de empresa) abrem os
 * links sozinhos e aprovariam o login de quem tem a senha. A pessoa escolhe
 * "Sim, fui eu" ou "Não fui eu"; o segundo bloqueia a tentativa e já leva a
 * criar uma senha nova, porque quem tentou entrar acertou a senha.
 */
function ConfirmContent() {
  const params = useSearchParams();
  const email = params.get('email') ?? '';
  const token = params.get('token') ?? '';
  // Veio do botão "Não fui eu" do e-mail.
  const denyFirst = params.get('acao') === 'negar';
  const incomplete = !email || !token;

  const [state, setState] = useState<'ask' | 'ok' | 'denied' | 'error'>(incomplete ? 'error' : 'ask');
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState(incomplete ? 'Link incompleto. Faça login novamente.' : '');
  const [resetUrl, setResetUrl] = useState('');

  async function send(action: Action) {
    setBusy(action);
    try {
      const res = await fetch(action === 'confirm' ? '/api/auth/login-confirm-challenge' : '/api/auth/login-deny-challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error);
      if (action === 'deny') {
        setResetUrl(typeof d.reset === 'string' && d.reset.startsWith('/redefinir-senha?') ? d.reset : '');
        setState('denied');
      } else {
        setState('ok');
      }
    } catch (err: unknown) {
      setState('error');
      setError(userMessage(err, action === 'confirm' ? 'Não foi possível confirmar o login.' : 'Não foi possível bloquear agora. Tente de novo.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="w-full max-w-[420px] mx-auto text-center py-10">
      <Link href="/" className="flex justify-center mb-10">
        <BrandLogo alt="Mikma Lençóis – início" className="h-9 w-auto object-contain" />
      </Link>

      {state === 'ask' && (
        <>
          <div className="w-20 h-20 rounded-full bg-warm border border-mist flex items-center justify-center mx-auto mb-6">
            <IconShield size={36} strokeWidth={1.5} className="text-clay" />
          </div>
          <h1 className="font-display font-normal text-ink text-2xl mb-2">
            {denyFirst ? 'Bloquear esta tentativa?' : 'Foi você que tentou entrar?'}
          </h1>
          <p className="text-mid text-sm leading-relaxed mb-8">
            {denyFirst ? (
              <>Quem tentou entrar na conta <strong className="text-ink break-all">{email}</strong> sabe a sua senha. Bloqueie a tentativa e crie uma senha nova agora.</>
            ) : (
              <>Alguém digitou a senha certa da conta <strong className="text-ink break-all">{email}</strong>. No e-mail estão o horário, o aparelho e de onde foi.</>
            )}
          </p>
          <div className="flex flex-col gap-3" aria-busy={busy !== null}>
            {denyFirst ? (
              <>
                <button type="button" onClick={() => send('deny')} disabled={busy !== null} className="btn-primary-lg w-full disabled:opacity-60">
                  {busy === 'deny' ? 'Bloqueando…' : 'Bloquear e criar senha nova'}
                </button>
                <button type="button" onClick={() => send('confirm')} disabled={busy !== null} className="text-sm text-clay font-medium hover:underline disabled:opacity-60 py-2">
                  {busy === 'confirm' ? 'Confirmando…' : 'Na verdade fui eu, confirmar'}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => send('confirm')} disabled={busy !== null} className="btn-primary-lg w-full disabled:opacity-60">
                  {busy === 'confirm' ? 'Confirmando…' : 'Sim, fui eu'}
                </button>
                <button type="button" onClick={() => send('deny')} disabled={busy !== null} className="btn-outline-lg w-full disabled:opacity-60">
                  {busy === 'deny' ? 'Bloqueando…' : 'Não fui eu'}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {state === 'ok' && (
        <>
          <div className="w-20 h-20 rounded-full bg-green-50 border border-green-100 flex items-center justify-center mx-auto mb-6">
            <svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-green-500">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h1 className="font-display font-normal text-ink text-2xl mb-2">Login confirmado!</h1>
          <p className="text-mid text-sm">
            Pode fechar esta aba e voltar para a tela onde você digitou sua senha:
            ela continua sozinha em alguns segundos.
          </p>
        </>
      )}

      {state === 'denied' && (
        <>
          <div className="w-20 h-20 rounded-full bg-warm border border-mist flex items-center justify-center mx-auto mb-6">
            <IconShield size={36} strokeWidth={1.5} className="text-clay" />
          </div>
          <h1 className="font-display font-normal text-ink text-2xl mb-2">Tentativa bloqueada</h1>
          <p className="text-mid text-sm leading-relaxed mb-8">
            Essa entrada não acontece mais. Mas quem tentou sabe a sua senha: crie uma nova agora.
            Com a senha nova, todos os aparelhos conectados à conta saem.
          </p>
          {resetUrl ? (
            <Link href={resetUrl} className="btn-primary-lg w-full">Criar senha nova</Link>
          ) : (
            <>
              <p className="text-mid text-sm mb-6">Na tela de login, use &quot;Esqueci minha senha&quot;.</p>
              <Link href="/entrar" className="btn-primary inline-flex h-12 px-8 items-center justify-center text-[13px] font-semibold">
                Ir para o login
              </Link>
            </>
          )}
        </>
      )}

      {state === 'error' && (
        <>
          <div className="w-20 h-20 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-6">
            <IconAlert size={40} strokeWidth={1.5} className="text-red-500" />
          </div>
          <h1 className="font-display font-normal text-ink text-2xl mb-2">Não foi possível concluir</h1>
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
