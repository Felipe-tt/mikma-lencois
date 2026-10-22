'use client';
import { userMessage } from '@/lib/userMessage';
import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { auth } from '@/lib/firebase/client';
import { signInWithEmailAndPassword } from 'firebase/auth';
import Link from 'next/link';
import Image from 'next/image';
import { BrandLogo } from '@/components/BrandLogo';
import { GoogleSignInButton } from '@/components/ui/GoogleSignInButton';
import { consumeReturnTo, peekReturnTo, returnToReason } from '@/lib/auth/returnTo';
import { Overlay } from '@/components/ui/Overlay';
import { getRecaptchaToken } from '@/lib/recaptcha-client';
import { IconAlert } from '@/components/ui/Icon';
import { PasswordInput } from '@/components/auth/PasswordInput';


// ── Modal recuperação de senha ────────────────────────────────────────────────
function ForgotPasswordModal({ defaultEmail, onClose }: { defaultEmail: string; onClose: () => void }) {
  const [email, setEmail]     = useState(defaultEmail);
  const [step, setStep]       = useState<'email' | 'sent'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resent, setResent]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  async function sendLink(e?: React.FormEvent) {
    e?.preventDefault();
    if (!email.trim()) return;
    setLoading(true); setError(''); setResent(false);
    try {
      const recaptchaToken = await getRecaptchaToken('send_reset');
      const res = await fetch('/api/auth/send-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), recaptchaToken }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error);
      setStep('sent');
      setResendCooldown(60);
    } catch {
      // Sempre avança, não revela se e-mail existe
      setStep('sent');
      setResendCooldown(60);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setResent(false);
    await sendLink();
    setResent(true);
    setTimeout(() => setResent(false), 4000);
  }

  return (
    <Overlay onClose={onClose} labelledBy="forgot-title" className="relative w-full max-w-sm bg-paper shadow-2xl p-8 rounded-3xl">
      {close => (<>
        <button type="button" onClick={close} aria-label="Fechar" className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center text-faint hover:text-ink hover:bg-warm active:scale-90 transition-[color,background-color,transform] duration-150">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {step === 'email' && (
          <>
            <p id="forgot-title" className="font-display text-xl text-ink mb-1">Esqueceu a senha?</p>
            <p className="text-sm text-mid mb-6 leading-relaxed">
              Informe seu e-mail e enviaremos um link com um botão para criar uma nova senha.
            </p>
            {error && <p role="alert" className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
            <form onSubmit={sendLink} className="flex flex-col gap-4">
              <div>
                <label htmlFor="forgot-email" className="label">Seu e-mail</label>
                <input id="forgot-email" ref={inputRef} autoFocus type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="input text-base" placeholder="seu@email.com" autoComplete="email" />
              </div>
              <button type="submit" disabled={loading}
                className="btn-primary w-full h-12 text-sm font-semibold flex items-center justify-center gap-2">
                {loading ? <><span className="spinner"/> Enviando…</> : 'Enviar link'}
              </button>
            </form>
          </>
        )}

        {step === 'sent' && (
          <>
            <div className="w-14 h-14 rounded-full bg-clay/10 flex items-center justify-center mb-5">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-clay">
                <path d="M22 6l-10 7L2 6" /><rect x="2" y="4" width="20" height="16" rx="2" />
              </svg>
            </div>
            <p id="forgot-title" className="font-display text-xl text-ink mb-1">Veja seu e-mail</p>
            <p className="text-sm text-mid mb-6 leading-relaxed">
              Se este e-mail estiver cadastrado, enviamos um link para <strong className="text-ink">{email}</strong>. Clique no botão{' '}
              <strong className="text-ink">&ldquo;Criar nova senha&rdquo;</strong> no e-mail para continuar.
            </p>
            <div className="text-center">
              <p className="text-xs text-faint mb-1">Não recebeu? Verifique o spam.</p>
              <button onClick={handleResend} disabled={resendCooldown > 0 || loading}
                className="text-sm text-clay font-medium hover:underline disabled:text-faint transition-colors">
                {loading ? 'Enviando…' : resendCooldown > 0 ? `Reenviar em ${resendCooldown}s` : 'Reenviar link'}
              </button>
              {resent && <p role="status" className="text-xs text-green-600 mt-2">E-mail reenviado.</p>}
            </div>
          </>
        )}
      </>)}
    </Overlay>
  );
}


const noopSubscribe = () => () => {};

export default function LoginPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  // Quando o reCAPTCHA vem com score "suspeito, mas não claramente bot",
  // a API pede confirmação extra por e-mail antes de liberar o login
  // (ver checkRecaptchaScore em src/lib/recaptcha.ts). Essa tela some
  // sozinha assim que a pessoa clica no link do e-mail, via polling.
  const [awaitingChallenge, setAwaitingChallenge] = useState(false);
  const [challengeExpired, setChallengeExpired] = useState(false);

  // Por que caiu aqui (ex: tentou abrir o carrinho deslogado). Só no
  // navegador: no servidor não há sessionStorage.
  const returnReason = useSyncExternalStore(noopSubscribe, () => returnToReason(peekReturnTo()), () => null);

  useEffect(() => { if (user) router.push(consumeReturnTo() ?? '/'); }, [user, router]);

  // Poll pra saber se a pessoa já confirmou pelo link do e-mail. Assim
  // que confirmar, completa o login de verdade com a senha que já está
  // em memória nesta aba (este projeto não usa createCustomToken, ver
  // comentário em reset-password/route.ts — quem autentica de fato é
  // sempre o client, via signInWithEmailAndPassword).
  useEffect(() => {
    if (!awaitingChallenge) return;
    let cancelled = false;
    const startedAt = Date.now();

    const interval = setInterval(async () => {
      if (cancelled) return;
      if (Date.now() - startedAt > 10 * 60 * 1000) {
        setChallengeExpired(true);
        setAwaitingChallenge(false);
        return;
      }
      try {
        const res = await fetch(`/api/auth/login-challenge-status?email=${encodeURIComponent(email)}`);
        const d = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (d.expired) {
          setChallengeExpired(true);
          setAwaitingChallenge(false);
          return;
        }
        if (d.confirmed) {
          setAwaitingChallenge(false);
          try {
            await signInWithEmailAndPassword(auth, email, password);
          } catch {
            setError('Confirmado, mas não foi possível concluir o login. Tente novamente.');
          }
        }
      } catch {
        // soluço de rede num poll não deve derrubar a espera, só tenta de novo no próximo tick
      }
    }, 3000);

    return () => { cancelled = true; clearInterval(interval); };
  }, [awaitingChallenge, email, password]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(''); setChallengeExpired(false);
    try {
      // Rate limit check primeiro
      const recaptchaToken = await getRecaptchaToken('login');
      const rl = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, recaptchaToken }),
      });
      const rlData = await rl.json().catch(() => ({}));
      if (!rl.ok) {
        throw new Error(rlData.error || 'Erro ao entrar');
      }
      if (rlData.requiresEmailChallenge) {
        setAwaitingChallenge(true);
        setLoading(false);
        return;
      }

      // Firebase Auth é a fonte da verdade para a senha
      await signInWithEmailAndPassword(auth, email, password);
      // Redirect fica a cargo do useEffect acima (respeita returnTo, e
      // evita corrida: se pusesse aqui, sobrescreveria o destino certo
      // com '/' antes do consumeReturnTo() do effect rodar).
    } catch (err: unknown) {
      if (err instanceof Error) {
        const msg = err.message;
        if (msg.includes('Muitas tentativas')) {
          setError(msg);
        } else if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password') || msg.includes('auth/user-not-found')) {
          setError('E-mail ou senha incorretos.');
        } else if (msg.includes('auth/too-many-requests')) {
          setError('Muitas tentativas. Tente novamente em alguns minutos.');
        } else if (msg.includes('auth/network-request-failed')) {
          setError('Erro de conexão. Verifique sua internet.');
        } else if (msg.includes('auth/user-disabled')) {
          setError('Esta conta está desativada. Fale com a loja pelo WhatsApp.');
        } else if (msg.includes('auth/invalid-email')) {
          setError('Confira o e-mail digitado.');
        } else if (/^(Firebase|auth\/)/i.test(msg) || !msg) {
          // Nunca mostra texto cru do Firebase ("Firebase: Error (auth/...)").
          setError('Não foi possível entrar. Tente de novo.');
        } else {
          setError(userMessage(err, 'Não foi possível entrar. Tente de novo.'));
        }
      } else {
        setError('Não foi possível entrar. Tente de novo.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {showForgot && (
        <ForgotPasswordModal
          defaultEmail={email}
          onClose={() => setShowForgot(false)}
        />
      )}

      <div className="min-h-screen bg-paper flex">
        {/* Painel esquerdo, logo em destaque */}
        <div className="hidden lg:flex w-[45%] xl:w-1/2 flex-col justify-between p-12 xl:p-16 bg-warm border-r border-mist relative overflow-hidden">
          <Image
            src="/logo-moon-transparent.png"
            alt=""
            width={400}
            height={400}
            aria-hidden="true"
            className="pointer-events-none select-none absolute top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[72%] max-w-[460px] h-auto object-contain opacity-[0.07] dark:opacity-[0.06]"
          />
          <Link href="/" className="relative z-10">
            <BrandLogo alt="Mikma Lençóis – início" className="h-9 w-auto object-contain" />
          </Link>

          <div className="relative z-10">
            {/* Texto no pé do painel: no meio ele caía em cima da lua e
                colidia com o "Mikma" dentro dela. */}
            <p className="font-display text-ink font-normal leading-[1.04] tracking-[-0.015em] mb-4 text-[clamp(2.2rem,3vw,3.2rem)]">
              Bem-vindo<br />de <em className="text-clay">volta.</em>
            </p>
            <p className="text-[14px] text-mid leading-relaxed max-w-[30ch]">Lençóis de qualidade direto de fábrica.</p>
            <p className="mt-10 pt-6 border-t border-mist-d/60 text-[11px] text-faint tracking-[0.2em] uppercase">Blumenau · SC · Brasil</p>
          </div>
        </div>

        {/* Formulário */}
        <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-paper">
          <div className="w-full max-w-[400px]">
            <Link href="/" className="flex mb-10 lg:hidden">
              <BrandLogo alt="Mikma Lençóis – início" className="h-8 w-auto object-contain" />
            </Link>

            {returnReason && (
              <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-clay/10 text-clay px-3.5 py-1.5 text-[12.5px] font-medium animate-fade-in">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                {returnReason}
              </p>
            )}
            <h1 className="font-display font-normal text-ink text-[2.2rem] mb-2 leading-tight">Entrar</h1>
            <p className="text-[14px] text-mid mb-8">
              Não tem conta?{' '}
              <Link href="/cadastro" className="text-clay font-medium hover:text-clay-d transition-colors">Criar conta grátis</Link>
            </p>

            {challengeExpired && (
              <div className="mb-6 px-4 py-3 bg-amber-50 border border-amber-200 text-sm text-amber-700 flex items-center gap-2 rounded-xl">
                <IconAlert size={16} className="shrink-0" />
                O link de confirmação expirou. Tente entrar novamente.
              </div>
            )}

            {error && (
              <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2 rounded-xl">
                <IconAlert size={16} className="shrink-0" />
                {error}
              </div>
            )}

            {awaitingChallenge ? (
              <div className="border border-mist bg-warm rounded-2xl px-6 py-8 text-center">
                <div className="w-14 h-14 rounded-full bg-clay/10 flex items-center justify-center mx-auto mb-5">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-clay">
                    <path d="M22 6l-10 7L2 6" /><rect x="2" y="4" width="20" height="16" rx="2" />
                  </svg>
                </div>
                <p className="font-display text-xl text-ink mb-1">Confirme por e-mail</p>
                <p className="text-sm text-mid mb-6 leading-relaxed">
                  Por segurança, enviamos um link de confirmação para{' '}
                  <strong className="text-ink">{email}</strong>. Clique nele — esta tela
                  continua sozinha assim que você confirmar.
                </p>
                <div className="flex items-center justify-center gap-2 text-xs text-faint mb-4">
                  <span className="spinner-dark" style={{ width: 14, height: 14 }} />
                  Aguardando confirmação…
                </div>
                <button
                  type="button"
                  onClick={() => { setAwaitingChallenge(false); setError(''); }}
                  className="text-sm text-clay font-medium hover:underline"
                >
                  Cancelar e voltar
                </button>
              </div>
            ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div>
                <label htmlFor="login-email" className="label">E-mail</label>
                <input id="login-email" type="email" required value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input" placeholder="seu@email.com" autoComplete="email" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="login-senha" className="label !mb-0">Senha</label>
                  <button type="button" onClick={() => setShowForgot(true)}
                    className="text-xs text-clay hover:text-clay-d transition-colors py-2 -my-2">
                    Esqueci minha senha
                  </button>
                </div>
                <PasswordInput id="login-senha" required value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Sua senha" autoComplete="current-password" />
              </div>

              <button type="submit" disabled={loading}
                className="btn-primary w-full h-12 text-[13px] font-semibold tracking-wide flex items-center justify-center gap-2">
                {loading ? <><span className="spinner" /><span>Entrando…</span></> : 'Entrar na minha conta'}
              </button>
            </form>
            )}

            {!awaitingChallenge && (
              <>
                <div className="flex items-center gap-3 my-6">
                  <div className="flex-1 divider" />
                  <span className="text-xs text-faint uppercase tracking-wider">ou</span>
                  <div className="flex-1 divider" />
                </div>

                <GoogleSignInButton onError={setError} />
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
