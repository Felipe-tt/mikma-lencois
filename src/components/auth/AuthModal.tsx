'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import { useAuthModal } from '@/lib/auth/AuthModalContext';
import { setReturnTo } from '@/lib/auth/returnTo';
import { GoogleSignInButton } from '@/components/ui/GoogleSignInButton';
import { BrandLogo } from '@/components/BrandLogo';

type SignupStep = 'form' | 'awaiting';
type ForgotStep = 'email' | 'sent';

export function AuthModal() {
  const { isOpen, mode, setMode, close } = useAuthModal();

  // ── Login ──
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // ── Signup ──
  const [name, setName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupStep, setSignupStep] = useState<SignupStep>('form');
  const [signupError, setSignupError] = useState('');
  const [signupLoading, setSignupLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // ── Esqueci a senha ──
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStep, setForgotStep] = useState<ForgotStep>('email');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotResendCooldown, setForgotResendCooldown] = useState(0);
  const [forgotResent, setForgotResent] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);

  // Reseta o formulário sempre que o modal fecha, pra não reabrir com lixo do uso anterior.
  useEffect(() => {
    if (!isOpen) {
      setEmail(''); setPassword(''); setLoginError('');
      setName(''); setSignupEmail(''); setSignupStep('form'); setSignupError('');
      setForgotEmail(''); setForgotStep('email'); setForgotResent(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isOpen, close]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  useEffect(() => {
    if (forgotResendCooldown <= 0) return;
    const t = setTimeout(() => setForgotResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [forgotResendCooldown]);

  if (!isOpen) return null;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginLoading(true); setLoginError('');
    try {
      const rl = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (rl.status === 429) throw new Error((await rl.json()).error);

      await signInWithEmailAndPassword(auth, email, password);
      // O AuthModalProvider detecta o login (via onAuthStateChanged) e
      // fecha o modal + roda a ação pendente sozinho — nada a fazer aqui.
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('Muitas tentativas')) setLoginError(msg);
      else if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password') || msg.includes('auth/user-not-found')) setLoginError('E-mail ou senha incorretos.');
      else if (msg.includes('auth/network-request-failed')) setLoginError('Erro de conexão. Verifique sua internet.');
      else setLoginError(msg || 'Erro ao entrar');
    } finally {
      setLoginLoading(false);
    }
  }

  async function sendVerification(e: React.FormEvent) {
    e.preventDefault();
    setSignupError('');
    if (name.trim().length < 2) return setSignupError('Por favor, informe seu nome completo.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupEmail)) return setSignupError('Por favor, informe um e-mail válido.');

    setSignupLoading(true);
    try {
      // Guarda onde a pessoa estava — o link do e-mail leva pra uma página
      // cheia (fora do modal), então é lá que usamos isso pra voltar aqui.
      setReturnTo(window.location.pathname + window.location.hash);
      const res = await fetch('/api/auth/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: signupEmail.trim().toLowerCase() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setSignupStep('awaiting');
      setResendCooldown(60);
    } catch (err: unknown) {
      setSignupError(err instanceof Error ? err.message : 'Erro ao enviar. Tente novamente.');
    } finally {
      setSignupLoading(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setSignupLoading(true); setSignupError('');
    try {
      const res = await fetch('/api/auth/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: signupEmail.trim().toLowerCase() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setResendCooldown(60);
    } catch (err: unknown) {
      setSignupError(err instanceof Error ? err.message : 'Erro ao reenviar.');
    } finally {
      setSignupLoading(false);
    }
  }

  async function sendForgotLink(e?: React.FormEvent) {
    e?.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotLoading(true); setForgotResent(false);
    try {
      await fetch('/api/auth/send-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      });
    } finally {
      // Sempre avança — não revela se o e-mail existe ou não na base.
      setForgotStep('sent');
      setForgotResendCooldown(60);
      setForgotLoading(false);
    }
  }

  async function handleForgotResend() {
    if (forgotResendCooldown > 0) return;
    setForgotResent(false);
    await sendForgotLink();
    setForgotResent(true);
    setTimeout(() => setForgotResent(false), 4000);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-[rgba(30,18,8,0.6)] backdrop-blur-sm" />
      <div ref={dialogRef} className="relative w-full max-w-[420px] bg-paper shadow-2xl p-7 sm:p-9 max-h-[90vh] overflow-y-auto">
        <button onClick={close} aria-label="Fechar" className="absolute top-4 right-4 text-mist hover:text-mid transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <Link href="/" className="flex mb-6">
          <BrandLogo alt="Mikma" className="h-7 w-auto object-contain" />
        </Link>

        {mode === 'login' ? (
          <>
            <h2 className="font-display font-normal text-ink text-[1.7rem] mb-1">Entrar</h2>
            <p className="text-[13px] text-mid mb-6">
              Não tem conta?{' '}
              <button type="button" onClick={() => setMode('signup')} className="text-clay font-medium hover:text-clay-d transition-colors">
                Criar conta grátis
              </button>
            </p>

            {loginError && (
              <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2 rounded-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {loginError}
              </div>
            )}

            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div>
                <label className="label">E-mail</label>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  className="input" placeholder="seu@email.com" autoComplete="email" autoFocus />
              </div>
              <div>
                <label className="label">Senha</label>
                <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                  className="input" placeholder="••••••••" autoComplete="current-password" />
              </div>
              <button type="submit" disabled={loginLoading}
                className="btn-primary w-full h-12 text-[13px] font-semibold tracking-wide flex items-center justify-center gap-2 mt-1">
                {loginLoading ? <><span className="spinner" /><span>Entrando...</span></> : 'Entrar na minha conta'}
              </button>
            </form>

            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 divider" /><span className="text-xs text-faint uppercase tracking-wider">ou</span><div className="flex-1 divider" />
            </div>
            <GoogleSignInButton onError={setLoginError} />

            <button
              type="button"
              onClick={() => { setForgotEmail(email); setForgotStep('email'); setMode('forgot'); }}
              className="block w-full text-center text-xs text-faint hover:text-mid transition-colors mt-5"
            >
              Esqueci minha senha
            </button>
          </>
        ) : mode === 'signup' ? (
          <>
            {signupStep === 'form' && (
              <>
                <h2 className="font-display font-normal text-ink text-[1.7rem] mb-1">Criar conta</h2>
                <p className="text-[13px] text-mid mb-6">
                  Já tem conta?{' '}
                  <button type="button" onClick={() => setMode('login')} className="text-clay font-medium hover:text-clay-d transition-colors">
                    Entrar
                  </button>
                </p>

                {signupError && (
                  <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2 rounded-sm">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {signupError}
                  </div>
                )}

                <form onSubmit={sendVerification} className="flex flex-col gap-4">
                  <div>
                    <label className="label">Seu nome completo</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)}
                      className="input" placeholder="Maria da Silva" autoComplete="name" autoFocus />
                  </div>
                  <div>
                    <label className="label">Seu e-mail</label>
                    <input type="email" value={signupEmail} onChange={e => setSignupEmail(e.target.value)}
                      className="input" placeholder="seuemail@exemplo.com" autoComplete="email" />
                    <p className="mt-1.5 text-xs text-mid">Vamos te enviar um e-mail com um botão para confirmar.</p>
                  </div>
                  <button type="submit" disabled={signupLoading}
                    className="btn-primary w-full h-12 text-[13px] font-semibold tracking-wide flex items-center justify-center gap-2 mt-1">
                    {signupLoading ? <><span className="spinner" /> Enviando…</> : 'Continuar'}
                  </button>
                </form>

                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 divider" /><span className="text-xs text-faint uppercase tracking-wider">ou</span><div className="flex-1 divider" />
                </div>
                <GoogleSignInButton onError={setSignupError} />
              </>
            )}

            {signupStep === 'awaiting' && (
              <>
                <div className="w-14 h-14 bg-clay/10 flex items-center justify-center mx-auto mb-5">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-clay">
                    <path d="M22 6l-10 7L2 6" /><rect x="2" y="4" width="20" height="16" rx="2" />
                  </svg>
                </div>
                <h2 className="font-display font-normal text-ink text-[1.5rem] mb-2 text-center">Veja seu e-mail</h2>
                <p className="text-[13px] text-mid mb-5 leading-relaxed text-center">
                  Enviamos um link para <strong className="text-ink">{signupEmail}</strong>. Abra o e-mail e clique no botão{' '}
                  <strong className="text-ink">&ldquo;Confirmar meu e-mail&rdquo;</strong> — você volta pra cá exatamente de onde saiu.
                </p>

                {signupError && (
                  <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 text-sm text-red-700 rounded-sm">{signupError}</div>
                )}

                <div className="text-center">
                  <p className="text-sm text-mid mb-2">Não recebeu o e-mail?</p>
                  <button onClick={handleResend} disabled={resendCooldown > 0 || signupLoading}
                    className="text-sm text-clay font-medium hover:underline disabled:text-faint disabled:no-underline transition-colors">
                    {signupLoading ? 'Enviando…' : resendCooldown > 0 ? `Reenviar em ${resendCooldown}s` : 'Enviar novamente'}
                  </button>
                  <p className="text-xs text-faint mt-2">Verifique também a caixa de spam.</p>
                  <button onClick={() => { setSignupStep('form'); setSignupError(''); }}
                    className="block mx-auto mt-4 text-xs text-faint hover:text-mid underline underline-offset-2">
                    Usar outro e-mail
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          // ── Esqueci a senha ──
          <>
            {forgotStep === 'email' && (
              <>
                <h2 className="font-display font-normal text-ink text-[1.5rem] mb-1">Esqueceu a senha?</h2>
                <p className="text-[13px] text-mid mb-6 leading-relaxed">
                  Informe seu e-mail e enviaremos um link com um botão para criar uma nova senha.
                </p>
                <form onSubmit={sendForgotLink} className="flex flex-col gap-4">
                  <div>
                    <label className="label">Seu e-mail</label>
                    <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                      className="input" placeholder="seuemail@exemplo.com" autoComplete="email" autoFocus />
                  </div>
                  <button type="submit" disabled={forgotLoading}
                    className="btn-primary w-full h-12 text-[13px] font-semibold tracking-wide flex items-center justify-center gap-2 mt-1">
                    {forgotLoading ? <><span className="spinner" /> Enviando…</> : 'Enviar link'}
                  </button>
                </form>
                <button type="button" onClick={() => setMode('login')}
                  className="block mx-auto mt-5 text-xs text-faint hover:text-mid underline underline-offset-2">
                  Voltar para o login
                </button>
              </>
            )}

            {forgotStep === 'sent' && (
              <>
                <div className="w-14 h-14 bg-clay/10 flex items-center justify-center mb-5">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-clay">
                    <path d="M22 6l-10 7L2 6" /><rect x="2" y="4" width="20" height="16" rx="2" />
                  </svg>
                </div>
                <h2 className="font-display font-normal text-ink text-[1.5rem] mb-2">Veja seu e-mail</h2>
                <p className="text-[13px] text-mid mb-6 leading-relaxed">
                  Se este e-mail estiver cadastrado, enviamos um link para <strong className="text-ink">{forgotEmail}</strong>. Clique no botão{' '}
                  <strong className="text-ink">&ldquo;Criar nova senha&rdquo;</strong> no e-mail para continuar.
                </p>
                <div className="text-center">
                  <p className="text-xs text-faint mb-1">Não recebeu? Verifique o spam.</p>
                  <button onClick={handleForgotResend} disabled={forgotResendCooldown > 0 || forgotLoading}
                    className="text-sm text-clay font-medium hover:underline disabled:text-faint transition-colors">
                    {forgotLoading ? 'Enviando…' : forgotResendCooldown > 0 ? `Reenviar em ${forgotResendCooldown}s` : 'Reenviar link'}
                  </button>
                  {forgotResent && <p className="text-xs text-green-600 mt-2">E-mail reenviado.</p>}
                </div>
                <button type="button" onClick={() => setMode('login')}
                  className="block mx-auto mt-5 text-xs text-faint hover:text-mid underline underline-offset-2">
                  Voltar para o login
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
