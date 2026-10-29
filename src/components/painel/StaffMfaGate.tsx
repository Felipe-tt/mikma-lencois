'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { createPasskey, passkeyCancelled, passkeySupported, signInWithPasskey } from '@/lib/auth/passkeyClient';
import { TotpSetup } from '@/components/painel/TotpSetup';

const noopSubscribe = () => () => {};

/**
 * Tela obrigatória do painel para quem é da equipe e entrou só com senha
 * ou Google: antes de ver qualquer coisa, cria uma passkey (ou liga o app
 * autenticador) e entra com ela. Vale para vendedor novo também, sem
 * ninguém precisar avisar. O servidor e as regras do banco exigem o mesmo.
 */
export function StaffMfaGate() {
  const { logout } = useAuth();
  const router = useRouter();
  const supported = useSyncExternalStore(noopSubscribe, passkeySupported, () => false);
  const [hasPasskey, setHasPasskey] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [useApp, setUseApp] = useState(false);

  useEffect(() => {
    let alive = true;
    auth.currentUser?.getIdToken()
      .then(token => fetch('/api/auth/passkey', { headers: { Authorization: `Bearer ${token}` } }))
      .then(r => (r.ok ? r.json() : { passkeys: [] }))
      .then(d => { if (alive) setHasPasskey((d.passkeys ?? []).length > 0); })
      .catch(() => { if (alive) setHasPasskey(false); });
    return () => { alive = false; };
  }, []);

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError('');
    try {
      await fn();
    } catch (err) {
      if (!passkeyCancelled(err)) setError(err instanceof Error ? err.message : 'Não foi possível concluir. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  // Entrar com a passkey troca a sessão por uma com a segunda etapa; o
  // PainelGuard percebe pelo token e libera o painel sozinho.
  const enterWithPasskey = () => run(() => signInWithPasskey());
  const createAndEnter = () => run(async () => {
    const u = auth.currentUser;
    if (!u) return;
    await createPasskey(await u.getIdToken());
    await signInWithPasskey();
  });

  // App autenticador recém-ligado só vale num login novo (senha + código).
  async function reloginWithCode() {
    await logout();
    router.push('/entrar');
  }

  return (
    <div className="min-h-screen bg-warm flex items-center justify-center p-5">
      <div className="w-full max-w-md rounded-3xl bg-paper p-6 sm:p-8 shadow-xl">
        <h1 className="font-display text-2xl text-ink">Proteja sua conta da equipe</h1>
        <p className="mt-2 text-[13.5px] text-mid leading-relaxed">
          Para entrar no painel, a loja pede uma segunda etapa além da senha. Com uma <strong className="text-ink">passkey</strong>,
          você entra com a digital, o rosto ou o PIN do aparelho, e quem descobrir sua senha não entra.
        </p>

        {!useApp && (
          <div className="mt-6 flex flex-col gap-3">
            {hasPasskey === null ? (
              <span className="spinner-dark w-5 h-5 self-center" />
            ) : !supported ? (
              <p className="text-[13px] text-red-700">Este navegador não suporta passkey. Use o app autenticador abaixo ou outro navegador.</p>
            ) : hasPasskey ? (
              <>
                <button onClick={enterWithPasskey} disabled={busy} className="btn-primary w-full">
                  {busy ? 'Aguardando o aparelho…' : 'Entrar com minha passkey'}
                </button>
                <p className="text-[12px] text-faint">Sua passkey está em outro aparelho? Entre por ele, ou use o app autenticador.</p>
              </>
            ) : (
              <button onClick={createAndEnter} disabled={busy} className="btn-primary w-full">
                {busy ? 'Aguardando o aparelho…' : 'Criar passkey e entrar'}
              </button>
            )}
            <button onClick={() => setUseApp(true)} className="text-[13px] text-mid underline self-start">
              Prefiro usar um app autenticador
            </button>
          </div>
        )}

        {useApp && (
          <div className="mt-6">
            <TotpSetup onEnrolled={reloginWithCode} />
            <button onClick={() => setUseApp(false)} className="mt-3 text-[13px] text-mid underline">Voltar para passkey</button>
          </div>
        )}

        {error && <p role="alert" className="mt-4 text-[12.5px] font-medium text-red-700">{error}</p>}

        <button onClick={logout} className="mt-6 text-[12.5px] text-faint hover:text-ink">Sair da conta</button>
      </div>
    </div>
  );
}
