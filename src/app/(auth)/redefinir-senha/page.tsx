'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { auth } from '@/lib/firebase/client';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import Link from 'next/link';
import Image from 'next/image';

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

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: 'Mínimo 8 caracteres', ok: password.length >= 8 },
    { label: 'Letra maiúscula', ok: /[A-Z]/.test(password) },
    { label: 'Número', ok: /[0-9]/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;
  const colors = ['bg-red-500', 'bg-yellow-400', 'bg-green-500'];
  if (!password) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {[0,1,2].map(i => (
          <div key={i} className={`h-0.5 flex-1 transition-colors ${i < score ? colors[score-1] : 'bg-mist/30'}`} />
        ))}
      </div>
      <div className="flex gap-3">
        {checks.map(c => (
          <span key={c.label} className={`text-xs flex items-center gap-1 ${c.ok ? 'text-green-500' : 'text-faint'}`}>
            <span>{c.ok ? '✓' : '·'}</span>{c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const oobCode = params.get('oobCode') ?? '';

  const [step, setStep] = useState<'loading' | 'form' | 'success' | 'invalid'>('loading');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!oobCode) { setStep('invalid'); return; }
    verifyPasswordResetCode(auth, oobCode)
      .then(email => { setEmail(email); setStep('form'); })
      .catch(() => setStep('invalid'));
  }, [oobCode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Senha deve ter pelo menos 8 caracteres.'); return; }
    if (password !== confirm) { setError('Senhas não conferem.'); return; }
    setLoading(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);

      // Atualiza hash no Firestore para manter login email/senha funcionando
      try {
        const { signInWithEmailAndPassword: signIn, getIdToken } = await import('firebase/auth');
        const userCred = await signIn(auth, email, password);
        const token = await getIdToken(userCred.user);
        await fetch('/api/auth/update-password-hash', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ password }),
        });
      } catch { /* não bloqueia o fluxo se falhar */ }

      setStep('success');
      setTimeout(() => router.push('/entrar'), 2500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('expired') || msg.includes('invalid')) {
        setStep('invalid');
      } else {
        setError('Erro ao redefinir senha. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  }

  const Layout = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-warm flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex mb-10 justify-center">
          <Image src="/logo-dark.png" alt="Mikma" width={800} height={242} className="h-9 w-auto object-contain" />
        </Link>
        {children}
      </div>
    </div>
  );

  if (step === 'loading') return (
    <Layout>
      <div className="text-center py-12">
        <span className="spinner-dark mx-auto block w-8 h-8" />
        <p className="text-sm text-mid mt-4">Verificando link...</p>
      </div>
    </Layout>
  );

  if (step === 'invalid') return (
    <Layout>
      <div className="text-center py-8 space-y-4">
        <div className="w-14 h-14 bg-red-500/10 flex items-center justify-center mx-auto">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h2 className="font-display text-2xl text-ink">Link inválido</h2>
        <p className="text-sm text-mid">Este link expirou ou já foi utilizado.<br/>Solicite um novo link de recuperação.</p>
        <Link href="/entrar" className="btn-primary inline-block px-8 py-3 text-sm font-semibold mt-2">
          Voltar ao login
        </Link>
      </div>
    </Layout>
  );

  if (step === 'success') return (
    <Layout>
      <div className="text-center py-8 space-y-4">
        <div className="w-14 h-14 bg-green-500/10 flex items-center justify-center mx-auto">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-500">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h2 className="font-display text-2xl text-ink">Senha redefinida!</h2>
        <p className="text-sm text-mid">Sua senha foi alterada com sucesso.<br/>Redirecionando para o login...</p>
      </div>
    </Layout>
  );

  return (
    <Layout>
      <h1 className="font-display font-normal text-ink text-3xl mb-2">Nova senha</h1>
      <p className="text-sm text-mid mb-8">
        Definindo nova senha para <span className="text-ink font-medium">{email}</span>
      </p>

      {error && (
        <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2 rounded-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label className="label">Nova senha</label>
          <div className="relative">
            <input type={showPass ? 'text' : 'password'} required value={password}
              onChange={e => setPassword(e.target.value)}
              className="input pr-10" placeholder="Mínimo 8 caracteres" autoComplete="new-password" />
            <button type="button" onClick={() => setShowPass(p => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-mist hover:text-mid transition-colors">
              <EyeIcon open={showPass} />
            </button>
          </div>
          <PasswordStrength password={password} />
        </div>

        <div>
          <label className="label">Confirmar nova senha</label>
          <div className="relative">
            <input type={showConfirm ? 'text' : 'password'} required value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="input pr-10" placeholder="Repita a senha" autoComplete="new-password" />
            <button type="button" onClick={() => setShowConfirm(p => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-mist hover:text-mid transition-colors">
              <EyeIcon open={showConfirm} />
            </button>
          </div>
          {confirm && password === confirm && (
            <p className="mt-1 text-xs text-green-500 flex items-center gap-1"><span>✓</span> Senhas conferem</p>
          )}
        </div>

        <button type="submit" disabled={loading}
          className="btn-primary w-full py-3.5 text-sm font-semibold flex items-center justify-center gap-2">
          {loading ? <><span className="spinner" /><span>Salvando...</span></> : 'Salvar nova senha'}
        </button>

        <Link href="/entrar" className="text-sm text-mid hover:text-ink transition-colors text-center">
          Voltar ao login
        </Link>
      </form>
    </Layout>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-warm flex items-center justify-center">
        <span className="spinner-dark w-8 h-8" />
      </div>
    }>
      <ResetForm />
    </Suspense>
  );
}
