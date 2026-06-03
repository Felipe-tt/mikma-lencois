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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      router.push('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-stone-100 grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-stone-900 p-12">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-display text-2xl text-stone-100">Mikma</span>
          <span className="text-2xs font-semibold tracking-[0.2em] uppercase text-gold-400">Lençóis</span>
        </Link>
        <div>
          <p className="font-display text-4xl text-stone-100 font-light leading-tight mb-4">
            Cadastre-se e<br />receba em casa.
          </p>
          <p className="text-sm text-stone-500 leading-relaxed">
            Direto da fábrica para a sua cama.<br />Entrega em Blumenau em até 1 hora.
          </p>
        </div>
        <p className="text-xs text-stone-700 tracking-widest uppercase">Est. Blumenau · SC</p>
      </div>

      <div className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <Link href="/" className="lg:hidden flex items-baseline gap-2 mb-10 justify-center">
            <span className="font-display text-2xl text-stone-900">Mikma</span>
            <span className="text-2xs font-semibold tracking-[0.2em] uppercase text-gold-600">Lençóis</span>
          </Link>

          <h1 className="font-display text-3xl font-light text-stone-900 mb-1">Criar conta</h1>
          <p className="text-sm text-stone-500 mb-8">Cadastre-se para comprar</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 mb-6">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="flex flex-col gap-5">
            <div>
              <label className="label">Nome completo</label>
              <input type="text" required value={name} onChange={e => setName(e.target.value)} className="input" placeholder="Seu nome" />
            </div>
            <div>
              <label className="label">E-mail</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="input" placeholder="seu@email.com" />
            </div>
            <div>
              <label className="label">Senha</label>
              <input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} className="input" placeholder="Mínimo 8 caracteres" />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full mt-1 py-3.5">
              {loading ? <span className="spinner w-4 h-4" /> : 'Criar conta'}
            </button>
          </form>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-stone-200" />
            <span className="text-xs text-stone-400 uppercase tracking-widest">ou</span>
            <div className="flex-1 h-px bg-stone-200" />
          </div>

          <button onClick={async () => { await loginWithGoogle(); router.push('/'); }} className="btn-outline w-full gap-2.5">
            <GoogleIcon /> Continuar com Google
          </button>

          <p className="text-center mt-8 text-sm text-stone-500">
            Já tem conta?{' '}
            <Link href="/entrar" className="text-stone-900 font-semibold hover:underline">Entrar</Link>
          </p>
        </div>
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
