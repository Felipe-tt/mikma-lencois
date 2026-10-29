'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { createPasskey, passkeyCancelled, passkeySupported, signInWithPasskey } from '@/lib/auth/passkeyClient';
import { TotpSetup } from '@/components/painel/TotpSetup';
import { BrandLogo } from '@/components/BrandLogo';
import { IconArrowLeft, IconArrowRight, IconCheck, IconKey, IconLock, IconLogOut, IconMobile, IconShield } from '@/components/ui/Icon';

const noopSubscribe = () => () => {};

/** Quanto tempo a comemoração fica na tela antes de abrir o painel. */
const CELEBRATE_MS = 2200;
const LEAVE_MS = 450;
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Tela obrigatória do painel para quem é da equipe e entrou só com senha
 * ou Google: antes de ver qualquer coisa, cria uma passkey (ou liga o app
 * autenticador) e entra com ela. Vale para vendedor novo também, sem
 * ninguém precisar avisar. O servidor e as regras do banco exigem o mesmo.
 *
 * onHold: segura a tela montada enquanto comemora a entrada (o PainelGuard
 * trocaria pelo painel assim que o token novo chega).
 */
export function StaffMfaGate({ onHold }: { onHold?: (hold: boolean) => void } = {}) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const supported = useSyncExternalStore(noopSubscribe, passkeySupported, () => false);
  const [hasPasskey, setHasPasskey] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errorCount, setErrorCount] = useState(0);
  const [useApp, setUseApp] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'success' | 'leaving'>('idle');

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
      onHold?.(false);
      if (!passkeyCancelled(err)) {
        setError(err instanceof Error ? err.message : 'Não foi possível concluir. Tente de novo.');
        setErrorCount(c => c + 1);
      }
    } finally {
      setBusy(false);
    }
  }

  // Entrar com a passkey troca a sessão por uma com a segunda etapa. A tela
  // fica montada para a comemoração e só então o painel aparece.
  async function enter() {
    onHold?.(true);
    await signInWithPasskey();
    setPhase('success');
    await wait(CELEBRATE_MS);
    setPhase('leaving');
    await wait(LEAVE_MS);
    onHold?.(false);
  }
  const enterWithPasskey = () => run(enter);
  const createAndEnter = () => run(async () => {
    const u = auth.currentUser;
    if (!u) return;
    await createPasskey(await u.getIdToken());
    await enter();
  });

  // App autenticador recém-ligado só vale num login novo (senha + código).
  async function reloginWithCode() {
    await logout();
    router.push('/entrar');
  }

  const email = user?.email ?? '';
  const firstName = (user?.displayName ?? '').trim().split(/\s+/)[0];
  const success = phase !== 'idle';
  const steps = [
    hasPasskey ? 'Toque em entrar com a passkey' : 'Toque em criar passkey',
    'Desbloqueie o aparelho como sempre faz',
    'Pronto, o painel abre',
  ];
  // Passo atual: 0 antes de tocar, 1 enquanto espera o aparelho, 3 ao entrar.
  const current = success ? 3 : busy ? 1 : 0;
  const delay = (ms: number) => ({ animationDelay: `${ms}ms` });

  return (
    <div className={`painel-scope relative min-h-dvh overflow-hidden bg-warm flex items-center justify-center px-4 py-8 sm:py-12 ${phase === 'leaving' ? 'mfa-leave' : ''}`}>
      {/* Fundo: brilhos do accent que flutuam devagar */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="mfa-drift absolute -top-48 -left-32 w-[560px] h-[560px] rounded-full opacity-[0.18] blur-3xl"
          style={{ background: 'radial-gradient(circle, rgb(var(--c-clay)), transparent 65%)' }} />
        <div className="mfa-drift absolute -bottom-56 -right-40 w-[620px] h-[620px] rounded-full opacity-[0.12] blur-3xl"
          style={{ background: 'radial-gradient(circle, rgb(var(--c-clay-l)), transparent 65%)', animationDelay: '-9s' }} />
      </div>

      <div className="relative w-full max-w-[440px] lg:max-w-[940px] mfa-rise">
        <div className="mfa-border rounded-[30px] p-[1.5px] shadow-[0_30px_80px_-30px_rgba(40,20,5,0.4)]">
          <div className="relative lg:grid lg:grid-cols-[1fr_1.05fr] rounded-[28.5px] bg-paper overflow-hidden">

            {/* ── Lado da marca: ilustração e título ── */}
            <div className="relative overflow-hidden px-6 pt-7 pb-6 sm:px-8 lg:p-10 lg:flex lg:flex-col lg:justify-between bg-gradient-to-b from-clay/[0.13] via-clay/[0.05] to-transparent lg:bg-gradient-to-br lg:from-clay/[0.16] lg:via-clay/[0.07] lg:to-warm/40 lg:border-r lg:border-mist/70">
              <div className="flex items-center justify-between mfa-rise" style={delay(80)}>
                <BrandLogo alt="Mikma" className="h-7 w-auto object-contain" priority />
                <span className="inline-flex items-center gap-1.5 rounded-full bg-paper/80 backdrop-blur px-2.5 py-1 text-[10.5px] font-semibold tracking-[0.12em] uppercase text-clay ring-1 ring-clay/20">
                  <IconShield size={11} strokeWidth={2.2} /> Equipe
                </span>
              </div>

              <PasskeyArt busy={busy} success={success} />

              <div className="text-center lg:text-left">
                <p className="mfa-rise text-[10.5px] font-semibold tracking-[0.2em] uppercase text-clay" style={delay(220)}>Último passo para entrar</p>
                <h1 className="mfa-rise mt-2 font-display text-[28px] sm:text-[32px] leading-[1.1] text-ink text-balance" style={delay(280)}>
                  {useApp ? 'Ligue o app autenticador' : hasPasskey ? 'Entre com sua passkey' : 'Crie sua passkey de acesso'}
                </h1>
                <p className="mfa-rise mt-3 text-[13.5px] text-mid leading-relaxed text-pretty lg:max-w-[34ch]" style={delay(340)}>
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
                <ol aria-label="Etapas do acesso" className="mfa-rise flex items-center gap-2 text-[11px] font-semibold" style={delay(300)}>
                  <li className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center"><IconCheck size={11} strokeWidth={3} /></span>
                    Senha
                  </li>
                  <li aria-hidden className="relative flex-1 h-[2px] rounded-full bg-mist overflow-hidden">
                    <span className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-500 to-clay transition-[width] duration-700 ease-out ${success ? 'w-full' : busy ? 'w-2/3' : 'w-1/3'}`} />
                  </li>
                  <li aria-current="step" className="inline-flex items-center gap-1.5 text-ink">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors duration-500 ${success ? 'bg-emerald-500 text-white' : 'bg-clay text-paper'}`}>
                      {success ? <IconCheck size={11} strokeWidth={3} /> : <IconKey size={11} strokeWidth={2.4} />}
                    </span>
                    Passkey
                  </li>
                </ol>

                {!useApp ? (
                  <>
                    <p className="mfa-rise mt-7 text-[11px] font-semibold tracking-[0.14em] uppercase text-faint" style={delay(380)}>Como funciona</p>
                    <ol className="mt-3 relative">
                      {steps.map((step, i) => {
                        const done = i < current || (i === 2 && success);
                        const active = i === current && !success;
                        return (
                          <li key={i} className="mfa-rise relative flex gap-3.5 pb-4 last:pb-0" style={delay(440 + i * 90)}>
                            {i < steps.length - 1 && (
                              <span aria-hidden className="absolute left-[13px] top-7 bottom-0.5 w-px bg-mist overflow-hidden">
                                <span className={`absolute inset-x-0 top-0 bg-clay transition-[height] duration-500 ${done ? 'h-full' : 'h-0'}`} />
                              </span>
                            )}
                            <span className={`relative z-[1] flex w-[27px] h-[27px] shrink-0 items-center justify-center rounded-full text-[12px] font-semibold transition-all duration-300 ${
                              done ? 'bg-emerald-500 text-white ring-0 scale-105'
                                : active ? 'bg-clay text-paper mfa-active'
                                : 'bg-paper text-clay ring-1 ring-clay/25 shadow-card'}`}>
                              {done ? <IconCheck size={13} strokeWidth={2.8} /> : i + 1}
                            </span>
                            <span className={`pt-[4px] text-[13.5px] leading-snug transition-colors duration-300 ${active ? 'text-ink font-medium' : done ? 'text-mid' : 'text-ink'}`}>{step}</span>
                          </li>
                        );
                      })}
                    </ol>

                    <div className="mfa-rise mt-7" style={delay(720)}>
                      {hasPasskey === null ? (
                        <div className="h-[52px] rounded-2xl bg-warm/70 animate-pulse" />
                      ) : !supported ? (
                        <p className="rounded-2xl border border-amber-300/60 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-[13px] text-amber-800 dark:text-amber-300">
                          Este navegador não cria passkey. Use o app autenticador abaixo ou abra o painel em outro navegador.
                        </p>
                      ) : (
                        <>
                          <button onClick={hasPasskey ? enterWithPasskey : createAndEnter} disabled={busy || success}
                            className="mfa-glow group relative w-full h-[54px] overflow-hidden rounded-2xl bg-clay text-paper text-[14.5px] font-semibold flex items-center justify-center gap-2.5
                              transition-[transform,background-color] duration-200 hover:bg-clay-d hover:-translate-y-px active:translate-y-0 active:scale-[0.985] disabled:cursor-wait">
                            <span aria-hidden className="absolute inset-0 bg-gradient-to-b from-white/[0.16] to-transparent" />
                            <span aria-hidden className="mfa-shine absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                            {busy
                              ? <span className="relative flex items-center gap-2.5"><span className="spinner" /> Desbloqueie o aparelho…</span>
                              : <span className="relative flex items-center gap-2.5">
                                  <IconKey size={18} strokeWidth={2} />
                                  {hasPasskey ? 'Entrar com minha passkey' : 'Criar passkey e entrar'}
                                  <IconArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" />
                                </span>}
                          </button>
                          <p className="mt-3 text-center text-[12px] text-faint leading-relaxed">
                            {hasPasskey
                              ? 'Sua passkey está em outro aparelho? Entre por ele, ou use o app autenticador.'
                              : 'Fica salva no iCloud, no Google ou no Windows Hello do seu aparelho.'}
                          </p>
                        </>
                      )}
                    </div>

                    <button onClick={() => { setUseApp(true); setError(''); }} disabled={busy || success}
                      className="mfa-rise group mt-6 w-full flex items-center gap-3 rounded-2xl border border-dashed border-mist-d/70 px-4 py-3 text-left transition-all duration-200 hover:border-clay-l/50 hover:bg-warm/50 hover:-translate-y-px disabled:opacity-50"
                      style={delay(800)}>
                      <span className="flex w-9 h-9 shrink-0 items-center justify-center rounded-xl bg-warm text-mid group-hover:text-clay group-hover:rotate-[-8deg] transition-all duration-300"><IconMobile size={17} /></span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-medium text-ink">Prefiro um app autenticador</span>
                        <span className="block text-[11.5px] text-faint">Código de 6 dígitos a cada login</span>
                      </span>
                      <IconArrowRight size={15} className="text-faint transition-transform group-hover:translate-x-1" />
                    </button>
                  </>
                ) : (
                  <div className="mt-6 mfa-fade-in">
                    <button onClick={() => setUseApp(false)} className="group inline-flex items-center gap-1.5 text-[13px] text-mid hover:text-ink -ml-1 px-1 py-1">
                      <IconArrowLeft size={15} className="transition-transform group-hover:-translate-x-0.5" /> Voltar para passkey
                    </button>
                    <div className="mt-3 mfa-rise" style={delay(60)}>
                      <TotpSetup bare onEnrolled={reloginWithCode} />
                    </div>
                    <p className="mfa-rise mt-4 rounded-2xl bg-warm/70 px-4 py-3 text-[12px] text-mid leading-relaxed" style={delay(140)}>
                      Depois de ligar o app, você entra de novo com a senha e o código, e o painel abre.
                    </p>
                  </div>
                )}

                {error && (
                  <p key={errorCount} role="alert" className="mfa-shake mt-4 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10 px-4 py-3 text-[12.5px] font-medium text-red-700 dark:text-red-300">
                    <span aria-hidden className="mt-px font-bold">!</span>{error}
                  </p>
                )}
              </div>

              <div className="mfa-rise flex items-center justify-between gap-3 border-t border-mist/70 px-6 sm:px-8 lg:px-10 py-4" style={delay(860)}>
                <span className="flex items-center gap-2 min-w-0 text-[12px] text-faint">
                  <IconLock size={13} className="shrink-0" />
                  <span className="truncate">{email}</span>
                </span>
                <button onClick={logout} disabled={success} className="group inline-flex items-center gap-1.5 shrink-0 text-[12.5px] font-medium text-mid hover:text-ink py-2 -my-2">
                  <IconLogOut size={14} className="transition-transform group-hover:translate-x-0.5" /> Sair
                </button>
              </div>
            </div>

            {success && <SuccessOverlay name={firstName} leaving={phase === 'leaving'} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Comemoração ao entrar: selo verde desenhando o check, ondas e barra até
 * abrir o painel. Vai direto no body: os ancestrais animados prenderiam o
 * "fixed" dentro do cartão.
 */
function SuccessOverlay({ name, leaving }: { name: string; leaving: boolean }) {
  return createPortal(
    <div role="status" aria-live="polite" className={`${leaving ? 'mfa-leave' : 'mfa-fade-in'} fixed inset-0 z-50 flex items-center justify-center bg-paper/85 backdrop-blur-xl`}>
      <div className="relative flex flex-col items-center text-center px-8">
        <div className="relative w-28 h-28">
          {[0, 1, 2].map(i => (
            <span key={i} aria-hidden className="mfa-ripple absolute inset-0 rounded-full border-2 border-emerald-500/50"
              style={{ animationDelay: `${200 + i * 450}ms`, animationIterationCount: 2 }} />
          ))}
          <span aria-hidden className="mfa-pop absolute -inset-6 rounded-full bg-emerald-400/25 blur-2xl" style={{ animationDelay: '150ms' }} />
          <span className="mfa-pop absolute inset-0 flex items-center justify-center rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600 shadow-[0_18px_40px_-12px_rgba(16,185,129,0.7)]">
            <svg viewBox="0 0 52 52" className="w-14 h-14" fill="none" stroke="white" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M14 27l8 8 16-17" className="mfa-draw" style={{ '--len': 40, animationDelay: '380ms' } as React.CSSProperties} />
            </svg>
          </span>
        </div>

        <p className="mfa-rise mt-7 font-display text-[30px] leading-tight text-ink" style={{ animationDelay: '450ms' }}>
          Tudo certo{name ? `, ${name}` : ''}!
        </p>
        <p className="mfa-rise mt-1.5 text-[13.5px] text-mid" style={{ animationDelay: '550ms' }}>
          Sua conta está protegida. Abrindo o painel…
        </p>
        <div className="mfa-rise mt-6 w-48 h-1.5 rounded-full bg-mist overflow-hidden" style={{ animationDelay: '600ms' }}>
          <span className="mfa-fill block h-full origin-left rounded-full bg-gradient-to-r from-emerald-500 to-clay" style={{ animationDelay: '650ms' }} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Ilustração da passkey: celular com a chave na tela, ondas, órbita e
 * brilhos. Esperando o aparelho, as ondas aceleram; ao entrar, a chave vira
 * o selo verde. Só usa as cores do tema, então acompanha o claro e o escuro.
 */
function PasskeyArt({ busy, success }: { busy: boolean; success: boolean }) {
  return (
    <div aria-hidden className="mfa-rise relative mx-auto my-6 lg:my-8 w-[210px] h-[176px] lg:w-[250px] lg:h-[210px]" style={{ animationDelay: '150ms' }}>
      {/* halo + ondas */}
      <div className="absolute left-1/2 top-1/2 w-[150px] h-[150px] lg:w-[180px] lg:h-[180px] -ml-[75px] -mt-[75px] lg:-ml-[90px] lg:-mt-[90px]">
        <span className="absolute inset-0 rounded-full bg-clay/[0.07]" />
        <span className="absolute inset-[18%] rounded-full bg-clay/[0.08]" />
        {[0, 1].map(i => (
          <span key={i} className={`mfa-ripple absolute inset-[10%] rounded-full border ${success ? 'border-emerald-500/40' : 'border-clay/30'} ${busy ? 'mfa-ripple-fast' : ''}`}
            style={{ animationDelay: `${i * (busy ? 700 : 1600)}ms` }} />
        ))}
      </div>

      {/* órbitas com pontos */}
      <div className="mfa-orbit absolute left-1/2 top-1/2 w-[190px] h-[190px] lg:w-[226px] lg:h-[226px] -ml-[95px] -mt-[95px] lg:-ml-[113px] lg:-mt-[113px] rounded-full border border-dashed border-clay/15">
        <span className="absolute -top-1 left-1/2 -ml-1 w-2 h-2 rounded-full bg-clay/70" />
        <span className="absolute -bottom-[3px] left-[30%] w-1.5 h-1.5 rounded-full bg-clay-l/70" />
      </div>
      <div className="mfa-orbit-r absolute left-1/2 top-1/2 w-[132px] h-[132px] lg:w-[156px] lg:h-[156px] -ml-[66px] -mt-[66px] lg:-ml-[78px] lg:-mt-[78px]">
        <span className="absolute top-1/2 -right-1 -mt-1 w-2 h-2 rounded-full bg-emerald-500/60" />
      </div>

      {/* brilhos */}
      {[
        { c: 'left-[8%] top-[18%] w-4 h-4', d: '0s' },
        { c: 'right-[6%] bottom-[16%] w-3 h-3', d: '-1.1s' },
        { c: 'right-[14%] top-[8%] w-2.5 h-2.5', d: '-1.8s' },
        { c: 'left-[14%] bottom-[10%] w-2 h-2', d: '-0.6s' },
      ].map(s => (
        <svg key={s.c} viewBox="0 0 16 16" className={`mfa-twinkle absolute ${s.c} text-clay-l`} style={{ animationDelay: s.d }}>
          <path d="M8 0l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="currentColor" />
        </svg>
      ))}

      {/* celular */}
      <div className="absolute left-1/2 top-1/2 w-[86px] h-[150px] lg:w-[100px] lg:h-[176px] -ml-[43px] -mt-[75px] lg:-ml-[50px] lg:-mt-[88px]">
        <div className="mfa-float relative w-full h-full">
          <div className="relative w-full h-full rounded-[22px] bg-paper ring-1 ring-ink/10 shadow-[0_18px_40px_-14px_rgba(40,20,5,0.45)] p-[5px]">
            <div className="relative w-full h-full rounded-[17px] bg-gradient-to-b from-warm to-paper overflow-hidden flex flex-col items-center">
              <span className="mt-2 w-7 h-[5px] rounded-full bg-ink/80" />
              <span className={`relative mt-6 lg:mt-8 flex w-11 h-11 lg:w-12 lg:h-12 items-center justify-center rounded-2xl text-white transition-all duration-500 ${
                success ? 'bg-emerald-500 scale-110 shadow-[0_8px_20px_-6px_rgba(16,185,129,0.8)]' : 'bg-clay mfa-glow'} ${busy ? 'animate-pulse' : ''}`}>
                {success ? <IconCheck size={24} strokeWidth={2.8} className="mfa-pop" /> : <IconKey size={22} strokeWidth={2} />}
              </span>
              <span className="mt-4 w-12 h-[5px] rounded-full bg-mist" />
              <span className="mt-1.5 w-8 h-[5px] rounded-full bg-mist/70" />
              {/* reflexo passando na tela */}
              <span className="mfa-shine absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/40 to-transparent" style={{ animationDelay: '1.2s' }} />
            </div>
          </div>
          {/* selo de ok */}
          <span className="mfa-pop absolute -right-4 top-5 flex w-9 h-9 items-center justify-center rounded-full bg-emerald-500 text-white ring-4 ring-paper shadow-lg" style={{ animationDelay: '700ms' }}>
            <IconCheck size={17} strokeWidth={3} />
          </span>
        </div>
      </div>
    </div>
  );
}
