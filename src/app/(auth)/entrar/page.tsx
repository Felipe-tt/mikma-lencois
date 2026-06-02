'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import Link from 'next/link';

export default function LoginPage() {
  const { loginWithGoogle } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      router.push('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar');
    } finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Header */}
        <div style={{ marginBottom: 40, textAlign: 'center' }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <span style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 24, color: 'var(--ink)' }}>Mikma</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--warm-d)', letterSpacing: '0.18em', textTransform: 'uppercase', marginLeft: 6 }}>Lençóis</span>
          </Link>
          <p style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 26, fontWeight: 300, color: 'var(--ink)', marginTop: 24, marginBottom: 4 }}>Bem-vindo de volta</p>
          <p style={{ fontSize: 13, color: 'var(--ink-l)' }}>Entre na sua conta para continuar</p>
        </div>

        <div style={{ background: 'var(--white)', border: '1px solid var(--cream-d)', padding: 32 }}>
          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', padding: '10px 14px', marginBottom: 20, fontSize: 13, color: 'var(--red)' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 20 }}>
              <label className="label-field">E-mail</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="input-field" placeholder="seu@email.com" />
            </div>
            <div style={{ marginBottom: 28 }}>
              <label className="label-field">Senha</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="input-field" placeholder="••••••••" />
            </div>
            <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--cream-d)' }} />
            <span style={{ fontSize: 11, color: 'var(--ink-l)', letterSpacing: '0.08em' }}>ou</span>
            <div style={{ flex: 1, height: 1, background: 'var(--cream-d)' }} />
          </div>

          <button
            onClick={async () => { await loginWithGoogle(); router.push('/'); }}
            className="btn-outline"
            style={{ width: '100%', justifyContent: 'center', gap: 8 }}>
            <GoogleIcon /> Continuar com Google
          </button>
        </div>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: 'var(--ink-l)' }}>
          Não tem conta?{' '}
          <Link href="/cadastro" style={{ color: 'var(--ink)', fontWeight: 500, textDecoration: 'none' }}>
            Cadastrar
          </Link>
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
