'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { createPasskey, passkeyCancelled, passkeySupported, signInWithPasskey } from '@/lib/auth/passkeyClient';
import { TotpSetup } from '@/components/painel/TotpSetup';
import { BrandLogo } from '@/components/BrandLogo';
import { IconArrowLeft, IconArrowRight, IconBolt, IconCheck, IconKey, IconLock, IconLogOut, IconMobile, IconShield } from '@/components/ui/Icon';

const noopSubscribe = () => () => {};

/**
 * Tela obrigatória do painel para quem é da equipe e entrou só com senha
 * ou Google: antes de ver qualquer coisa, cria uma passkey (ou liga o app
 * autenticador) e entra com ela. Vale para vendedor novo também, sem
 * ninguém precisar avisar. O servidor e as regras do banco exigem o mesmo.
 */
export function StaffMfaGate() {
  const { user, logout } = useAuth();
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

  const email = user?.email ?? '';

  return (
    <div className="painel-scope relative min-h-dvh overflow-hidden bg-warm flex items-center justify-center px-4 py-10">
      {/* Brilho suave do accent atrás do cartão */}
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[640px] h-[640px] rounded-full opacity-[0.14] blur-3xl"
        style={{ background: 'radial-gradient(circle, rgb(var(--c-clay)), transparent 65%)' }} />

      <div className="relative w-full max-w-[420px] motion-safe:animate-fade-up">
        <div className="flex justify-center mb-6">
          <BrandLogo alt="Mikma" className="h-7 w-auto object-contain" priority />
        </div>

        <div className="panel-card rounded-3xl shadow-card-hover overflow-hidden">
          {/* Progresso: senha feita, falta a segunda etapa */}
          <div className="flex items-center gap-2 px-6 pt-5 text-[11px] font-semibold tracking-[0.08em] uppercase">
            <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <span className="w-4 h-4 rounded-full bg-emerald-500/15 flex items-center justify-center"><IconCheck size={10} strokeWidth={3} /></span>
              Senha
            </span>
            <span className="flex-1 h-px bg-mist" />
            <span className="inline-flex items-center gap-1.5 text-clay">
              <span className="w-4 h-4 rounded-full bg-clay/15 flex items-center justify-center text-[9px]">2</span>
              Segunda etapa
            </span>
          </div>

          <div className="px-6 sm:px-8 pt-7 pb-7">
            {!useApp ? (
              <>
                <div className="relative mx-auto w-20 h-20">
                  <span aria-hidden className="absolute inset-0 rounded-full bg-clay/10 motion-safe:animate-ping [animation-duration:2.4s]" />
                  <span className="relative flex w-20 h-20 items-center justify-center rounded-full bg-gradient-to-b from-clay/20 to-clay/5 ring-1 ring-clay/25 text-clay">
                    <IconKey size={36} strokeWidth={1.5} />
                  </span>
                </div>

                <h1 className="mt-6 text-center font-display text-[26px] leading-tight text-ink">Proteja sua conta da equipe</h1>
                <p className="mt-2 text-center text-[13.5px] text-mid leading-relaxed">
                  O painel pede uma segunda etapa além da senha. Com a <strong className="text-ink font-semibold">passkey</strong>, você
                  confirma com a digital, o rosto ou o PIN do aparelho.
                </p>

                <ul className="mt-6 grid gap-2.5">
                  {[
                    { icon: IconLock, text: 'Entra com digital, rosto ou PIN' },
                    { icon: IconShield, text: 'Quem souber sua senha não entra' },
                    { icon: IconBolt, text: 'Leva segundos e é uma vez só' },
                  ].map(({ icon: I, text }) => (
                    <li key={text} className="flex items-center gap-3 rounded-xl bg-warm/70 px-3.5 py-2.5 text-[13px] text-ink">
                      <span className="flex w-7 h-7 shrink-0 items-center justify-center rounded-lg bg-paper text-clay shadow-card"><I size={15} /></span>
                      {text}
                    </li>
                  ))}
                </ul>

                <div className="mt-6">
                  {hasPasskey === null ? (
                    <div className="h-12 flex items-center justify-center"><span className="spinner-dark w-5 h-5" /></div>
                  ) : !supported ? (
                    <p className="rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-[13px] text-amber-800 dark:text-amber-300">
                      Este navegador não cria passkey. Use o app autenticador abaixo ou abra o painel em outro navegador.
                    </p>
                  ) : (
                    <>
                      <button onClick={hasPasskey ? enterWithPasskey : createAndEnter} disabled={busy}
                        className="btn-primary w-full h-12 text-[14px] font-semibold flex items-center justify-center gap-2.5 disabled:opacity-70">
                        {busy
                          ? <><span className="spinner" /> Confirme no seu aparelho…</>
                          : <><IconKey size={18} /> {hasPasskey ? 'Entrar com minha passkey' : 'Criar passkey e entrar'}</>}
                      </button>
                      {hasPasskey && (
                        <p className="mt-2.5 text-center text-[12px] text-faint">Sua passkey está em outro aparelho? Entre por ele ou use o app autenticador.</p>
                      )}
                    </>
                  )}
                </div>

                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px bg-mist" />
                  <span className="text-[11px] text-faint uppercase tracking-wider">ou</span>
                  <div className="flex-1 h-px bg-mist" />
                </div>

                <button onClick={() => { setUseApp(true); setError(''); }}
                  className="group w-full flex items-center gap-3 rounded-xl border border-mist px-4 py-3 text-left transition-colors hover:border-clay-l/40 hover:bg-warm/60">
                  <span className="flex w-9 h-9 shrink-0 items-center justify-center rounded-lg bg-warm text-mid"><IconMobile size={17} /></span>
                  <span className="flex-1">
                    <span className="block text-[13.5px] font-medium text-ink">Usar app autenticador</span>
                    <span className="block text-[12px] text-faint">Código de 6 dígitos no celular</span>
                  </span>
                  <IconArrowRight size={16} className="text-faint transition-transform group-hover:translate-x-0.5" />
                </button>
              </>
            ) : (
              <div className="motion-safe:animate-fade-in">
                <button onClick={() => setUseApp(false)} className="inline-flex items-center gap-1.5 text-[13px] text-mid hover:text-ink -ml-1 px-1 py-1">
                  <IconArrowLeft size={15} /> Voltar para passkey
                </button>
                <div className="mt-3">
                  <TotpSetup bare onEnrolled={reloginWithCode} />
                </div>
                <p className="mt-4 rounded-xl bg-warm/70 px-3.5 py-2.5 text-[12px] text-mid leading-relaxed">
                  Depois de ligar o app, você entra de novo com a senha e o código, e o painel abre.
                </p>
              </div>
            )}

            {error && (
              <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10 px-3.5 py-2.5 text-[12.5px] font-medium text-red-700 dark:text-red-300">
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-mist/70 bg-warm/50 px-6 py-3.5">
            <span className="flex items-center gap-2 min-w-0 text-[12px] text-faint">
              <IconLock size={13} className="shrink-0" />
              <span className="truncate">{email}</span>
            </span>
            <button onClick={logout} className="inline-flex items-center gap-1.5 shrink-0 text-[12.5px] font-medium text-mid hover:text-ink py-2 -my-2">
              <IconLogOut size={14} /> Sair
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
