'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { auth } from '@/lib/firebase/client';
import { signInWithEmailAndPassword } from 'firebase/auth';
import Link from 'next/link';
import Image from 'next/image';
import { GoogleSignInButton } from '@/components/ui/GoogleSignInButton';

export default function LoginPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) router.push('/');
  }, [user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error);
      }
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/');
    } catch (err: unknown) {
      if (err instanceof Error) {
        const msg = err.message;
        if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password') || msg.includes('auth/user-not-found')) {
          setError('Credenciais inválidas');
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
    <div className="min-h-screen bg-warm flex">
      <div className="hidden lg:flex w-1/2 bg-ink flex-col justify-between p-16">
        <Link href="/">
          <Image src="/logo-white.png" alt="Logo" width={200} height={100} className="h-16 w-auto object-contain" />
        </Link>
        <div>
          <p className="font-display text-paper font-normal leading-tight mb-8 text-5xl xl:text-6xl">
            Bem-vindo<br/>de <em className="text-clay">volta.</em>
          </p>
          <p className="text-xl text-paper/40 leading-relaxed max-w-sm">
            Entre na sua conta para acompanhar pedidos e continuar comprando.
          </p>
        </div>
        <p className="text-sm text-paper/20 tracking-widest uppercase">Blumenau · SC · Brasil</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <Link href="/" className="flex mb-10 lg:hidden">
            <Image src="/logo-dark.png" alt="Logo" width={120} height={60} className="h-10 w-auto object-contain" />
          </Link>

          <h1 className="font-display font-normal text-ink text-3xl mb-2">Entrar</h1>
          <p className="text-sm text-mid mb-8">
            Não tem conta?{' '}
            <Link href="/cadastro" className="text-clay font-medium hover:underline transition-colors">Cadastrar</Link>
          </p>

          {error && (
            <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <label className="label">E-mail</label>
              <input
                type="email" required value={email}
                onChange={e => setEmail(e.target.value)}
                className="input" placeholder="seu@email.com"
              />
            </div>
            <div>
              <label className="label">Senha</label>
              <input
                type="password" required value={password}
                onChange={e => setPassword(e.target.value)}
                className="input" placeholder="••••••••"
              />
            </div>
            <button
              type="submit" disabled={loading}
              className="btn-primary w-full mt-1 py-3.5 text-sm font-semibold tracking-wide"
            >
              {loading ? <span className="spinner" /> : 'Entrar'}
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
  );
}
