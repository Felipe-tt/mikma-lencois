'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import Link from 'next/link';
import Image from 'next/image';
import { GoogleSignInButton } from '@/components/ui/GoogleSignInButton';

export default function RegisterPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (user) router.push('/'); }, [user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error);
      }
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-warm flex">

      {/* Left panel */}
      <div className="hidden lg:flex w-[45%] bg-ink flex-col justify-between p-14 xl:p-18">
        <Link href="/">
          <Image src="/logo-white.png" alt="Mikma Lençóis" width={120} height={60} className="h-12 w-auto object-contain opacity-80" />
        </Link>
        <div>
          <h2 className="font-display text-paper font-normal leading-[1.05] mb-6 text-5xl xl:text-6xl">
            Crie sua<br/><em className="text-clay not-italic">conta.</em>
          </h2>
          <p className="text-base text-paper/40 leading-relaxed max-w-xs">
            Cadastre-se e comece a comprar com entrega em até 1h em Blumenau.
          </p>
        </div>
        <p className="text-xs text-paper/20 tracking-widest uppercase">Blumenau · SC · Brasil</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">

          <Link href="/" className="flex mb-10 lg:hidden">
            <Image src="/logo-dark.png" alt="Mikma Lençóis" width={100} height={50} className="h-9 w-auto object-contain" />
          </Link>

          <h1 className="font-display font-normal text-ink text-3xl mb-2">Criar conta</h1>
          <p className="text-sm text-mid mb-8">
            Já tem conta?{' '}
            <Link href="/entrar" className="text-clay font-medium hover:underline">Entrar</Link>
          </p>

          {error && (
            <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <label className="label">Nome completo</label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="input"
                placeholder="Seu nome"
                autoComplete="name"
              />
            </div>
            <div>
              <label className="label">E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input"
                placeholder="seu@email.com"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="label">Senha</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input"
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3.5 mt-1"
            >
              {loading ? <span className="spinner" /> : 'Criar conta'}
            </button>
          </form>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 divider" />
            <span className="text-xs text-faint uppercase tracking-wider">ou</span>
            <div className="flex-1 divider" />
          </div>

          <GoogleSignInButton onError={setError} />

          <p className="text-xs text-faint text-center mt-6 leading-relaxed">
            Ao criar sua conta, você concorda com nossos{' '}
            <Link href="/termos" className="underline hover:text-clay transition-colors">Termos de uso</Link>
            {' '}e{' '}
            <Link href="/privacidade" className="underline hover:text-clay transition-colors">Política de privacidade</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
