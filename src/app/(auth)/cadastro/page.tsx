'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import Link from 'next/link';
import Image from 'next/image';
import { GoogleSignInButton } from '@/components/ui/GoogleSignInButton';

declare global {
  interface Window {
    grecaptcha?: { execute: (key: string, opts: { action: string }) => Promise<string> };
  }
}

export default function RegisterPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) router.push('/');
  }, [user, router]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
    if (!key || document.getElementById('recaptcha-script')) return;
    const script = document.createElement('script');
    script.id = 'recaptcha-script';
    script.src = `https://www.google.com/recaptcha/api.js?render=${key}`;
    script.async = true;
    document.head.appendChild(script);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
      let recaptchaToken: string | undefined;
      if (siteKey && window.grecaptcha) {
        recaptchaToken = await window.grecaptcha.execute(siteKey, { action: 'register' });
      }
      const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password, recaptchaToken }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/');
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Erro ao cadastrar'); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-warm flex">
      <div className="hidden lg:flex w-1/2 bg-ink flex-col justify-between p-16">
        <Link href="/">
          <Image src="/logo-white.png" alt="Mikma Lençóis" width={140} height={70} className="h-12 w-auto object-contain" />
        </Link>
        <div>
          <p className="font-display text-paper font-normal leading-tight mb-6">
            Crie sua<br/><em className="text-clay">conta.</em>
          </p>
          <p className="text-base text-paper/40 leading-relaxed max-w-xs">
            Cadastre-se e comece a comprar com entrega em até 1h em Blumenau.
          </p>
        </div>
        <p className="text-xs text-paper/20 tracking-widest uppercase">Blumenau · SC · Brasil</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <Link href="/" className="flex mb-10 lg:hidden">
            <Image src="/logo-dark.png" alt="Mikma Lençóis" width={120} height={60} className="h-10 w-auto object-contain" />
          </Link>

          <h1 className="font-display font-normal text-ink text-3xl mb-2">Criar conta</h1>
          <p className="text-sm text-mid mb-8">Já tem conta? <Link href="/entrar" className="text-clay font-medium hover:text-clay-d transition-colors">Entrar</Link></p>

          {error && (
            <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
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
            <button type="submit" disabled={loading} className="btn-primary w-full mt-2 py-3.5 text-sm font-semibold tracking-wide">
              {loading ? <span className="spinner" /> : 'Criar conta'}
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
