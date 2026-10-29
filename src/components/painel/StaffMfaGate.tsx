'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { createPasskey, passkeyCancelled, passkeySupported, signInWithPasskey } from '@/lib/auth/passkeyClient';
import { TotpSetup } from '@/components/painel/TotpSetup';
import { BrandLogo } from '@/components/BrandLogo';
import { IconArrowLeft, IconArrowRight, IconCheck, IconKey, IconLock, IconLogOut, IconMobile, IconShield } from '@/components/ui/Icon';

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
  const steps = hasPasskey
    ? ['Toque em entrar com a passkey', 'Desbloqueie o aparelho como sempre faz', 'Pronto, o painel abre']
    : ['Toque em criar passkey', 'Desbloqueie o aparelho como sempre faz', 'Pronto, o painel abre'];

  return (
    <div className="painel-scope relative min-h-dvh overflow-hidden bg-warm flex items-center justify-center px-4 py-8 sm:py-12">
      {/* Fundo: dois brilhos suaves do accent */}
      <div aria-hidden className="pointer-events-none absolute -top-48 -left-32 w-[560px] h-[560px] rounded-full opacity-[0.16] blur-3xl"
        style={{ background: 'radial-gradient(circle, rgb(var(--c-clay)), transparent 65%)' }} />
      <div aria-hidden className="pointer-events-none absolute -bottom-56 -right-40 w-[620px] h-[620px] rounded-full opacity-[0.10] blur-3xl"
        style={{ background: 'radial-gradient(circle, rgb(var(--c-clay-l)), transparent 65%)' }} />

      <div className="relative w-full max-w-[440px] lg:max-w-[920px] motion-safe:animate-fade-up">
        <div className="lg:grid lg:grid-cols-[1fr_1.05fr] rounded-[28px] bg-paper border border-mist/80 shadow-[0_30px_80px_-30px_rgba(40,20,5,0.35)] overflow-hidden">

          {/* ── Lado da marca: ilustração e título ── */}
          <div className="relative overflow-hidden px-6 pt-7 pb-6 sm:px-8 lg:p-10 lg:flex lg:flex-col lg:justify-between bg-gradient-to-b from-clay/[0.13] via-clay/[0.05] to-transparent lg:bg-gradient-to-br lg:from-clay/[0.16] lg:via-clay/[0.07] lg:to-warm/40 lg:border-r lg:border-mist/70">
            <div className="flex items-center justify-between">
              <BrandLogo alt="Mikma" className="h-7 w-auto object-contain" priority />
              <span className="inline-flex items-center gap-1.5 rounded-full bg-paper/80 backdrop-blur px-2.5 py-1 text-[10.5px] font-semibold tracking-[0.12em] uppercase text-clay ring-1 ring-clay/20">
                <IconShield size={11} strokeWidth={2.2} /> Equipe
              </span>
            </div>

            <PasskeyArt busy={busy} />

            <div className="text-center lg:text-left">
              <p className="text-[10.5px] font-semibold tracking-[0.2em] uppercase text-clay">Último passo para entrar</p>
              <h1 className="mt-2 font-display text-[28px] sm:text-[32px] leading-[1.1] text-ink text-balance">
                {useApp ? 'Ligue o app autenticador' : hasPasskey ? 'Entre com sua passkey' : 'Crie sua passkey de acesso'}
              </h1>
              <p className="mt-3 text-[13.5px] text-mid leading-relaxed text-pretty lg:max-w-[34ch]">
                {useApp
                  ? 'Um código novo a cada 30 segundos no seu celular. Mesmo que alguém descubra sua senha, não entra no painel.'
                  : 'Uma chave guardada no seu aparelho, liberada só por você. Mesmo que alguém descubra sua senha, não entra no painel.'}
              </p>
            </div>
          </div>

          {/* ── Lado da ação ── */}
          <div className="flex flex-col">
            <div className="px-6 sm:px-8 lg:px-10 pt-2 lg:pt-10 pb-7 flex-1">
              {/* Progresso: a senha já foi, falta a passkey */}
              <ol aria-label="Etapas do acesso" className="flex items-center gap-2 text-[11px] font-semibold">
                <li className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center"><IconCheck size={11} strokeWidth={3} /></span>
                  Senha
                </li>
                <li aria-hidden className="flex-1 h-px bg-gradient-to-r from-emerald-500/40 to-clay/40" />
                <li aria-current="step" className="inline-flex items-center gap-1.5 text-ink">
                  <span className="w-5 h-5 rounded-full bg-clay text-paper flex items-center justify-center"><IconKey size={11} strokeWidth={2.4} /></span>
                  Passkey
                </li>
              </ol>

              {!useApp ? (
                <>
                  <p className="mt-7 text-[11px] font-semibold tracking-[0.14em] uppercase text-faint">Como funciona</p>
                  <ol className="mt-3 relative">
                    {steps.map((step, i) => (
                      <li key={step} className="relative flex gap-3.5 pb-4 last:pb-0">
                        {i < steps.length - 1 && <span aria-hidden className="absolute left-[13px] top-7 bottom-0.5 w-px bg-mist" />}
                        <span className={`relative z-[1] flex w-[27px] h-[27px] shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${
                          i === steps.length - 1 ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/25' : 'bg-paper text-clay ring-1 ring-clay/25 shadow-card'}`}>
                          {i === steps.length - 1 ? <IconCheck size={13} strokeWidth={2.6} /> : i + 1}
                        </span>
                        <span className="pt-[4px] text-[13.5px] text-ink leading-snug">{step}</span>
                      </li>
                    ))}
                  </ol>

                  <div className="mt-7">
                    {hasPasskey === null ? (
                      <div className="h-[52px] rounded-2xl bg-warm/70 animate-pulse" />
                    ) : !supported ? (
                      <p className="rounded-2xl border border-amber-300/60 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-[13px] text-amber-800 dark:text-amber-300">
                        Este navegador não cria passkey. Use o app autenticador abaixo ou abra o painel em outro navegador.
                      </p>
                    ) : (
                      <>
                        <button onClick={hasPasskey ? enterWithPasskey : createAndEnter} disabled={busy}
                          className="group relative w-full h-[52px] overflow-hidden rounded-2xl bg-clay text-paper text-[14.5px] font-semibold flex items-center justify-center gap-2.5
                            shadow-[0_10px_28px_-10px_rgb(var(--c-clay)/0.75)] transition-[transform,box-shadow,background-color] duration-200
                            hover:bg-clay-d hover:shadow-[0_14px_32px_-10px_rgb(var(--c-clay)/0.85)] active:scale-[0.985] disabled:opacity-80 disabled:cursor-wait">
                          <span aria-hidden className="absolute inset-0 bg-gradient-to-b from-white/[0.14] to-transparent" />
                          {busy
                            ? <><span className="spinner" /> Desbloqueie o aparelho…</>
                            : <><IconKey size={18} strokeWidth={2} /> {hasPasskey ? 'Entrar com minha passkey' : 'Criar passkey e entrar'}
                                <IconArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" /></>}
                        </button>
                        <p className="mt-3 text-center text-[12px] text-faint leading-relaxed">
                          {hasPasskey
                            ? 'Sua passkey está em outro aparelho? Entre por ele, ou use o app autenticador.'
                            : 'Fica salva no iCloud, no Google ou no Windows Hello do seu aparelho.'}
                        </p>
                      </>
                    )}
                  </div>

                  <button onClick={() => { setUseApp(true); setError(''); }}
                    className="group mt-6 w-full flex items-center gap-3 rounded-2xl border border-dashed border-mist-d/70 px-4 py-3 text-left transition-colors hover:border-clay-l/50 hover:bg-warm/50">
                    <span className="flex w-9 h-9 shrink-0 items-center justify-center rounded-xl bg-warm text-mid group-hover:text-clay transition-colors"><IconMobile size={17} /></span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-medium text-ink">Prefiro um app autenticador</span>
                      <span className="block text-[11.5px] text-faint">Código de 6 dígitos a cada login</span>
                    </span>
                    <IconArrowRight size={15} className="text-faint transition-transform group-hover:translate-x-0.5" />
                  </button>
                </>
              ) : (
                <div className="mt-6 motion-safe:animate-fade-in">
                  <button onClick={() => setUseApp(false)} className="inline-flex items-center gap-1.5 text-[13px] text-mid hover:text-ink -ml-1 px-1 py-1">
                    <IconArrowLeft size={15} /> Voltar para passkey
                  </button>
                  <div className="mt-3">
                    <TotpSetup bare onEnrolled={reloginWithCode} />
                  </div>
                  <p className="mt-4 rounded-2xl bg-warm/70 px-4 py-3 text-[12px] text-mid leading-relaxed">
                    Depois de ligar o app, você entra de novo com a senha e o código, e o painel abre.
                  </p>
                </div>
              )}

              {error && (
                <p role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10 px-4 py-3 text-[12.5px] font-medium text-red-700 dark:text-red-300">
                  {error}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-mist/70 px-6 sm:px-8 lg:px-10 py-4">
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
    </div>
  );
}

/**
 * Ilustração da passkey: celular com a chave na tela e o selo de "ok".
 * Só usa as cores do tema, então acompanha o claro e o escuro.
 */
function PasskeyArt({ busy }: { busy: boolean }) {
  return (
    <div aria-hidden className="relative mx-auto my-6 lg:my-8 w-[200px] h-[168px] lg:w-[240px] lg:h-[200px]">
      <svg viewBox="0 0 240 200" className="absolute inset-0 w-full h-full overflow-visible">
        <circle cx="120" cy="100" r="92" fill="rgb(var(--c-clay))" opacity="0.06" />
        <circle cx="120" cy="100" r="68" fill="rgb(var(--c-clay))" opacity="0.07" />
        {/* brilhos */}
        <path d="M40 46l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="rgb(var(--c-clay-l))" opacity="0.7" />
        <path d="M200 140l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="rgb(var(--c-clay-l))" opacity="0.6" />
        <circle cx="212" cy="96" r="3" fill="rgb(var(--c-clay))" opacity="0.35" />
        <circle cx="48" cy="150" r="2.5" fill="rgb(var(--c-clay))" opacity="0.3" />
      </svg>

      {/* celular */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[86px] h-[150px] lg:w-[100px] lg:h-[176px] motion-safe:animate-float-y">
        <div className="relative w-full h-full rounded-[22px] bg-paper ring-1 ring-ink/10 shadow-[0_18px_40px_-14px_rgba(40,20,5,0.4)] p-[5px]">
          <div className="relative w-full h-full rounded-[17px] bg-gradient-to-b from-warm to-paper overflow-hidden flex flex-col items-center">
            <span className="mt-2 w-7 h-[5px] rounded-full bg-ink/80" />
            <span className={`relative mt-6 lg:mt-8 flex w-11 h-11 lg:w-12 lg:h-12 items-center justify-center rounded-2xl bg-clay text-paper shadow-[0_8px_18px_-6px_rgb(var(--c-clay)/0.8)] ${busy ? 'motion-safe:animate-pulse' : ''}`}>
              <IconKey size={22} strokeWidth={2} />
            </span>
            <span className="mt-4 w-12 h-[5px] rounded-full bg-mist" />
            <span className="mt-1.5 w-8 h-[5px] rounded-full bg-mist/70" />
          </div>
        </div>
        {/* selo de ok */}
        <span className="absolute -right-4 top-5 flex w-9 h-9 items-center justify-center rounded-full bg-emerald-500 text-white ring-4 ring-paper shadow-lg motion-safe:animate-scale-in [animation-delay:400ms]">
          <IconCheck size={17} strokeWidth={3} />
        </span>
      </div>
    </div>
  );
}
