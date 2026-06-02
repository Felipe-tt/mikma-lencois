'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import Link from 'next/link';

export default function RegisterPage() {
  const { loginWithGoogle } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      router.push('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-10">
          <Link href="/" className="no-underline inline-flex items-baseline gap-1.5">
            <span className="font-display text-[24px] text-ink">Mikma</span>
            <span className="text-[10px] font-semibold text-warm-dark tracking-[0.2em] uppercase">Lençóis</span>
          </Link>
          <p className="font-display font-light text-[26px] text-ink mt-6 mb-1">Criar conta</p>
          <p className="text-[13px] text-ink-light">Cadastre-se para comprar</p>
        </div>

        <div className="bg-paper border border-cream-dark p-8">
          {error && (
            <div className="bg-red-50 border border-red-200 px-4 py-3 mb-5 text-[13px] text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <label className="label-field">Nome completo</label>
              <input type="text" required value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="Seu nome" />
            </div>
            <div>
              <label className="label-field">E-mail</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="input-field" placeholder="seu@email.com" />
            </div>
            <div>
              <label className="label-field">Senha</label>
              <input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} className="input-field" placeholder="Mínimo 8 caracteres" />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center mt-1">
              {loading ? 'Criando conta…' : 'Criar conta'}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-cream-dark" />
            <span className="text-[11px] text-ink-light tracking-[0.08em]">ou</span>
            <div className="flex-1 h-px bg-cream-dark" />
          </div>

          <button onClick={async () => { await loginWithGoogle(); router.push('/'); }} className="btn-outline w-full justify-center gap-2">
            <GoogleIcon /> Continuar com Google
          </button>
        </div>

        <p className="text-center mt-6 text-[13px] text-ink-light">
          Já tem conta?{' '}
          <Link href="/entrar" className="text-ink font-medium no-underline hover:underline">Entrar</Link>
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}
