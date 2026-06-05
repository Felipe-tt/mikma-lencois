'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import Link from 'next/link';
import Image from 'next/image';

export default function RegisterPage() {
  const { loginWithGoogle } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name,email,password}) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      // Login automático após cadastro
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/');
    } catch(err: unknown) { setError(err instanceof Error ? err.message : 'Erro ao cadastrar'); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-warm flex">
      <div className="hidden lg:flex w-1/2 bg-ink flex-col justify-between p-16">
        <Link href="/">
          <Image src="/logo-white.png" alt="Mikma Lençóis" width={140} height={70} className="h-12 w-auto object-contain" />
        </Link>
        <div>
          <p className="font-display text-paper font-normal leading-tight mb-6" >
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
              <input type="text" required value={name} onChange={e=>setName(e.target.value)} className="input" placeholder="Seu nome" />
            </div>
            <div>
              <label className="label">E-mail</label>
              <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} className="input" placeholder="seu@email.com" />
            </div>
            <div>
              <label className="label">Senha</label>
              <input type="password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} className="input" placeholder="Mínimo 8 caracteres" />
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

          <button onClick={() => loginWithGoogle()} className="btn-outline w-full gap-3 py-3.5">
            <GoogleIcon />
            <span className="text-sm font-medium">Continuar com Google</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>;
}
