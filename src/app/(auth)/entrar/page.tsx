'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { auth } from '@/lib/firebase/client';
import { signInWithEmailAndPassword } from 'firebase/auth';
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
  const [email, setEmail]     = useState(defaultEmail);
  const [step, setStep]       = useState<'email' | 'code' | 'done'>('email');
  const [code, setCode]       = useState(['','','','','','']);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const codeRefs = useRef<(HTMLInputElement|null)[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!email.trim()) return;
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/send-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setStep('code');
      setResendCooldown(60);
      setTimeout(() => codeRefs.current[0]?.focus(), 100);
    } catch (err: unknown) {
      // Sempre avança — não revela se e-mail existe
      setStep('code');
      setResendCooldown(60);
      setTimeout(() => codeRefs.current[0]?.focus(), 100);
    } finally {
      setLoading(false);
    }
  }

  function handleDigit(i: number, val: string) {
    const digit = val.replace(/\D/g,'').slice(-1);
    const next = [...code]; next[i] = digit; setCode(next); setError('');
    if (digit && i < 5) codeRefs.current[i+1]?.focus();
    if (next.every(d => d) && next.join('').length === 6) verifyCode(next.join(''));
  }

  async function verifyCode(codeStr: string) {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/auth/reset-password?email=${encodeURIComponent(email.toLowerCase())}&code=${codeStr}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      // Código ok — redireciona para página de nova senha com os dados
      onClose();
      window.location.href = `/redefinir-senha?email=${encodeURIComponent(email.toLowerCase())}&code=${codeStr}`;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Código incorreto.');
      setCode(['','','','','','']);
      setTimeout(() => codeRefs.current[0]?.focus(), 50);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm bg-paper shadow-2xl p-8">
        <button onClick={onClose} className="absolute top-4 right-4 text-mist hover:text-mid transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {step === 'email' && (
          <>
            <p className="font-display text-xl text-ink mb-1">Esqueceu a senha?</p>
            <p className="text-sm text-mid mb-6 leading-relaxed">
              Informe seu e-mail e enviaremos um código para criar uma nova senha.
            </p>
            {error && <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2">{error}</p>}
            <form onSubmit={sendCode} className="flex flex-col gap-4">
              <div>
                <label className="label">Seu e-mail</label>
                <input ref={inputRef} type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="input text-base" placeholder="seuemail@exemplo.com" autoComplete="email" />
              </div>
              <button type="submit" disabled={loading}
                className="btn-primary w-full h-12 text-sm font-semibold flex items-center justify-center gap-2">
                {loading ? <><span className="spinner"/> Enviando…</> : 'Enviar código'}
              </button>
            </form>
          </>
        )}

        {step === 'code' && (
          <>
            <p className="font-display text-xl text-ink mb-1">Digite o código</p>
            <p className="text-sm text-mid mb-6 leading-relaxed">
              Se este e-mail estiver cadastrado, enviamos um código de 6 dígitos para <strong className="text-ink">{email}</strong>.
            </p>
            {error && <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2">{error}</p>}
            <div className="flex gap-2 justify-center mb-6">
              {code.map((digit, i) => (
                <input key={i} ref={el => { codeRefs.current[i] = el; }}
                  type="text" inputMode="numeric" maxLength={1} value={digit}
                  onChange={e => handleDigit(i, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Backspace' && !code[i] && i > 0) codeRefs.current[i-1]?.focus(); }}
                  disabled={loading}
                  className={`w-11 h-13 text-center text-xl font-bold border-2 outline-none transition-colors
                    ${digit ? 'border-ink text-ink' : 'border-mist'}
                    focus:border-clay focus:ring-2 focus:ring-clay/10 disabled:opacity-50`} />
              ))}
            </div>
            {loading && (
              <p className="text-center text-sm text-mid mb-4 flex items-center justify-center gap-2">
                <span className="spinner-dark"/> Verificando…
              </p>
            )}
            <div className="text-center">
              <p className="text-xs text-faint mb-1">Não recebeu? Verifique o spam.</p>
              <button onClick={() => sendCode()} disabled={resendCooldown > 0 || loading}
                className="text-sm text-clay font-medium hover:underline disabled:text-faint transition-colors">
                {resendCooldown > 0 ? `Reenviar em ${resendCooldown}s` : 'Reenviar código'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


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

      <div className="min-h-screen bg-paper flex">
        {/* Painel esquerdo — logo em destaque */}
        <div className="hidden lg:flex w-[45%] xl:w-1/2 flex-col justify-between p-12 xl:p-16 bg-warm border-r border-mist">
          <Link href="/">
            <Image src="/logo-dark.png" alt="Mikma" width={800} height={242} className="h-9 w-auto object-contain" />
          </Link>

          <div className="flex-1 flex items-center justify-center py-8">
            <Image
              src="/logo-dark.png"
              alt="Mikma Lençóis"
              width={400}
              height={200}
              className="w-full max-w-[260px] h-auto object-contain opacity-[0.10]"
            />
          </div>

          <div>
            <p className="font-display text-ink font-normal leading-[1.08] mb-4 text-[clamp(1.8rem,2.5vw,2.6rem)]">
              Bem-vindo<br />de <em className="text-clay not-italic">volta.</em>
            </p>
            <p className="text-[13px] text-mid leading-relaxed max-w-[26ch]">
              Lençóis de qualidade direto de fábrica.
            </p>
          </div>
        </div>

        {/* Formulário */}
        <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-paper">
          <div className="w-full max-w-[400px]">
            <Link href="/" className="flex mb-10 lg:hidden">
              <Image src="/logo-dark.png" alt="Mikma" width={800} height={242} className="h-8 w-auto object-contain" />
            </Link>

            <h1 className="font-display font-normal text-ink text-[2.2rem] mb-2 leading-tight">Entrar</h1>
            <p className="text-[14px] text-mid mb-8">
              Não tem conta?{' '}
              <Link href="/cadastro" className="text-clay font-medium hover:text-clay-d transition-colors">Criar conta grátis</Link>
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
                className="btn-primary w-full h-12 text-[13px] font-semibold tracking-wide flex items-center justify-center gap-2">
                {loading ? <><span className="spinner" /><span>Entrando...</span></> : 'Entrar na minha conta'}
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
