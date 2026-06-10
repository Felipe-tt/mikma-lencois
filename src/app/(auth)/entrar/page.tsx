'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { auth } from '@/lib/firebase/client';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import Link from 'next/link';
import Image from 'next/image';
import { GoogleSignInButton } from '@/components/ui/GoogleSignInButton';

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

// ── Modal recuperação de senha ────────────────────────────────────────────────
function ForgotPasswordModal({ defaultEmail, onClose }: { defaultEmail: string; onClose: () => void }) {
  const [email, setEmail] = useState(defaultEmail);
  const [step, setStep] = useState<'form' | 'sent'>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Fecha com Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true); setError('');
    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase(), {
        url: `${window.location.origin}/redefinir-senha`,
        handleCodeInApp: false,
      });
      setStep('sent');
    } catch (err: unknown) {
      // Não revela se o email existe ou não — segurança
      setStep('sent');
      console.error('[forgot-password]', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    // Backdrop
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" />

      <div className="relative w-full max-w-sm bg-paper rounded-sm shadow-2xl p-8 animate-in fade-in zoom-in-95 duration-150">
        <button onClick={onClose}
          className="absolute top-4 right-4 text-mist hover:text-mid transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {step === 'form' ? (
          <>
            <div className="mb-6">
              <div className="w-10 h-10 rounded-full bg-clay/10 flex items-center justify-center mb-4">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-clay">
                  <rect x="2" y="4" width="20" height="16" rx="2"/>
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
              </div>
              <h2 className="font-display text-xl text-ink mb-1">Recuperar senha</h2>
              <p className="text-sm text-mid">Informe seu e-mail e enviaremos um link para redefinir sua senha.</p>
            </div>

            {error && (
              <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 text-xs text-red-700 rounded-sm">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="label">E-mail</label>
                <input ref={inputRef} type="email" required value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input" placeholder="seu@email.com" />
              </div>
              <button type="submit" disabled={loading}
                className="btn-primary w-full py-3 text-sm font-semibold flex items-center justify-center gap-2">
                {loading ? <><span className="spinner" /><span>Enviando...</span></> : 'Enviar link'}
              </button>
              <button type="button" onClick={onClose}
                className="text-sm text-mid hover:text-ink transition-colors text-center">
                Voltar ao login
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-5">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-500">
                  <rect x="2" y="4" width="20" height="16" rx="2"/>
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
              </div>
              <h2 className="font-display text-xl text-ink mb-2">E-mail enviado</h2>
              <p className="text-sm text-mid mb-1">
                Se esse endereço tiver uma conta, você receberá um link em instantes.
              </p>
              <p className="text-xs text-faint mb-6">Verifique também a caixa de spam.</p>
              <button onClick={onClose}
                className="btn-primary w-full py-3 text-sm font-semibold">
                Voltar ao login
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Página de login ────────────────────────────────────────────────────────────
export default function LoginPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  useEffect(() => { if (user) router.push('/'); }, [user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      // Rate limit check primeiro
      const rl = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (rl.status === 429) {
        const d = await rl.json();
        throw new Error(d.error);
      }

      // Firebase Auth é a fonte da verdade para a senha
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/');
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
        } else {
          setError(msg || 'Erro ao entrar');
        }
      } else {
        setError('Erro ao entrar');
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

      <div className="min-h-screen bg-warm flex">
        {/* Painel esquerdo */}
        <div className="hidden lg:flex w-1/2 bg-ink flex-col justify-between p-16">
          <Link href="/"><Image src="/logo-white.png" alt="Mikma" width={160} height={80} className="h-14 w-auto object-contain" /></Link>
          <div>
            <p className="font-display text-paper font-normal leading-[1.02] mb-6 text-[clamp(2.8rem,4.5vw,4.5rem)]">
              Bem-vindo<br />de <em className="text-clay not-italic">volta.</em>
            </p>
            <p className="text-base text-paper/40 leading-relaxed max-w-xs">
              Entre na sua conta para acompanhar pedidos e continuar comprando.
            </p>
          </div>
          <p className="text-xs text-paper/20 tracking-widest uppercase">Blumenau · SC · Brasil</p>
        </div>

        {/* Formulário */}
        <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-md">
            <Link href="/" className="flex mb-10 lg:hidden">
              <Image src="/logo-dark.png" alt="Mikma" width={120} height={60} className="h-10 w-auto object-contain" />
            </Link>

            <h1 className="font-display font-normal text-ink text-3xl mb-2">Entrar</h1>
            <p className="text-sm text-mid mb-8">
              Não tem conta?{' '}
              <Link href="/cadastro" className="text-clay font-medium hover:text-clay-d transition-colors">Cadastrar</Link>
            </p>

            {error && (
              <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2 rounded-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div>
                <label className="label">E-mail</label>
                <input type="email" required value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input" placeholder="seu@email.com" autoComplete="email" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="label !mb-0">Senha</label>
                  <button type="button" onClick={() => setShowForgot(true)}
                    className="text-xs text-clay hover:text-clay-d transition-colors">
                    Esqueci minha senha
                  </button>
                </div>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} required value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="input pr-10" placeholder="••••••••" autoComplete="current-password" />
                  <button type="button" onClick={() => setShowPass(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-mist hover:text-mid transition-colors">
                    <EyeIcon open={showPass} />
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading}
                className="btn-primary w-full mt-1 py-3.5 text-sm font-semibold tracking-wide flex items-center justify-center gap-2">
                {loading ? <><span className="spinner" /><span>Entrando...</span></> : 'Entrar'}
              </button>
            </form>

            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 divider" />
              <span className="text-xs text-faint uppercase tracking-wider">ou</span>
              <div className="flex-1 divider" />
            </div>

            <GoogleSignInButton onError={setError} />
          </div>
        </div>
      </div>
    </>
  );
}
