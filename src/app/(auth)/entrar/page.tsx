'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import Link from 'next/link';
import Image from 'next/image';

export default function LoginPage() {
  const { loginWithGoogle } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email,password}) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      router.push('/');
    } catch(err: unknown) { setError(err instanceof Error ? err.message : 'Erro ao entrar'); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-warm flex">
      {/* Left panel — decorative */}
      <div className="hidden lg:flex w-1/2 bg-ink flex-col justify-between p-16">
        <Link href="/">
          <Image src="/logo-white.png" alt="Mikma Lençóis" width={140} height={70} className="h-12 w-auto object-contain" />
        </Link>
        <div>
          <p className="font-display text-paper font-normal leading-tight mb-6" style={{fontSize:'3.5rem'}}>
            Bem-vindo<br/><em className="text-clay">de volta.</em>
          </p>
          <p className="text-base text-paper/40 leading-relaxed max-w-xs">
            Entre na sua conta para acompanhar pedidos e aproveitar nossas ofertas.
          </p>
        </div>
        <p className="text-xs text-paper/20 tracking-widest uppercase">Blumenau · SC · Brasil</p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <Link href="/" className="flex mb-10 lg:hidden">
            <Image src="/logo-dark.png" alt="Mikma Lençóis" width={120} height={60} className="h-10 w-auto object-contain" />
          </Link>

          <h1 className="font-display font-normal text-ink text-3xl mb-2">Entrar</h1>
          <p className="text-sm text-mid mb-8">Não tem conta? <Link href="/cadastro" className="text-clay font-medium hover:text-clay-d transition-colors">Criar conta grátis</Link></p>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">{error}</p>}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-mid mb-1.5">E-mail</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="seu@email.com"
                className="w-full px-4 py-3 bg-paper border border-line rounded text-ink placeholder:text-mist focus:outline-none focus:border-clay transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase text-mid mb-1.5">Senha</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"
                className="w-full px-4 py-3 bg-paper border border-line rounded text-ink placeholder:text-mist focus:outline-none focus:border-clay transition-colors" />
            </div>
            <button onClick={handleSubmit} disabled={loading}
              className="w-full py-3.5 bg-ink text-paper font-semibold rounded hover:bg-ink/90 transition-colors disabled:opacity-50">
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </div>

          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-line"/>
            <span className="text-xs text-mist uppercase tracking-widest">ou</span>
            <div className="flex-1 h-px bg-line"/>
          </div>

          <button onClick={loginWithGoogle}
            className="w-full py-3.5 bg-paper border border-line rounded font-medium text-ink hover:bg-warm transition-colors flex items-center justify-center gap-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continuar com Google
          </button>
        </div>
      </div>
    </div>
  );
}
